/**
 * Het 3D-voorbeeld op de achtergrond van een grafblad, met three.js.
 *
 * Dit bestand wordt pas geladen als er een grafblad openstaat
 * (GraafBladWeergave.tsx); three.js zit zo niet in het startpakket. Lichamen,
 * belichting en standpunt komen uit de weergave van het `@3d`-blok, zodat het
 * beeld gelijk is aan dat in een rekenblad.
 *
 * Het doek ligt onder de nodes en is doorzichtig: het vlak erachter bepaalt de
 * kleur. De laag met nodes laat de muis door, dus slepen op een lege plek komt
 * hier aan; op een node of verbinding komt het hier niet. Of dat slepen het beeld
 * draait of een kader trekt, beslist GraafBladWeergave vóór elke klik met
 * `zetDraaien` (Alt, of de knop "3D draaien"). Schuiven en zoomen van het vlak
 * regelt GraafBladWeergave ook.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { DrieDScene } from "@ifc-calc/core";
import { belichting, bouwModel, FOV, pasIn, ruimModelOp, type Model } from "../calc/drieDWeergave";

/** Het beeld past op minstens deze maat in mm: een losse punt wordt anders een bol over het hele vlak. */
const MIN_BEELD = 2000;

export class GraafAchtergrond {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera = new THREE.PerspectiveCamera(FOV, 2, 1, 1000);
  private readonly wereld = new THREE.Scene();
  private readonly controls: OrbitControls;
  private readonly ro: ResizeObserver;
  private readonly vak: HTMLElement;
  private model: Model | null = null;
  private json = "";
  /** De gebruiker heeft gedraaid of gezoomd: een herberekening laat het standpunt staan. */
  private aangeraakt = false;
  private gepland = 0;
  private weg = false;

  constructor(vak: HTMLElement, scene: DrieDScene) {
    this.vak = vak;
    // Gooit als er geen WebGL is; GraafBladWeergave toont dan de projectie van de kern.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.className = "graaf-3d-doek";
    belichting(this.wereld);

    // z wijst omhoog. Vóór de besturing instellen: die legt bij het maken vast om welke as hij draait.
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: null, RIGHT: null };
    this.controls.addEventListener("change", this.plan);
    this.controls.addEventListener("start", this.aanraking);
    vak.appendChild(canvas);

    this.ro = new ResizeObserver(() => this.maat());
    this.ro.observe(vak);
    this.toon(scene);
  }

  /** Toont `scene`. Dezelfde scène wordt niet opnieuw opgebouwd. */
  toon(scene: DrieDScene) {
    if (this.weg) return;
    const json = JSON.stringify(scene.elementen);
    if (json === this.json && this.model) return;
    this.json = json;
    if (this.model) {
      this.wereld.remove(this.model.groep);
      ruimModelOp(this.model);
    }
    this.model = bouwModel(scene);
    this.wereld.add(this.model.groep);
    this.maat(!this.aangeraakt);
  }

  /** Mag slepen op het doek het beeld draaien? Uit: de klik gaat naar het kader op het vlak. */
  zetDraaien(aan: boolean) {
    this.controls.enabled = aan;
  }

  /** Maakt het beeld weer passend, uit het eerste standpunt. */
  passend() {
    this.aangeraakt = false;
    this.pas();
  }

  /** Zoomt het beeld: `factor` groter dan 1 is verder weg. */
  zoom(factor: number) {
    const doel = this.controls.target;
    const naar = this.camera.position.clone().sub(doel).multiplyScalar(factor);
    const d = naar.length();
    if (d < this.controls.minDistance || d > this.controls.maxDistance) return;
    this.aangeraakt = true;
    this.camera.position.copy(doel).add(naar);
    this.controls.update();
    this.plan();
  }

  private pas() {
    if (!this.model) return;
    const grenzen = this.model.grenzen.clone();
    const maat = grenzen.getSize(new THREE.Vector3());
    const tekort = (MIN_BEELD - Math.max(maat.x, maat.y, maat.z)) / 2;
    if (tekort > 0) grenzen.expandByScalar(tekort);
    pasIn(this.camera, this.controls.target, grenzen, "iso");
    const d = this.camera.position.distanceTo(this.controls.target);
    this.controls.minDistance = d * 0.02;
    this.controls.maxDistance = d * 10;
    this.controls.update();
    this.plan();
  }

  private maat(opnieuw = false) {
    const b = this.vak.clientWidth;
    const h = this.vak.clientHeight;
    if (b > 0 && h > 0) {
      this.renderer.setSize(b, h, false);
      this.camera.aspect = b / h;
      this.camera.updateProjectionMatrix();
    }
    if (opnieuw) this.pas();
    else this.plan();
  }

  private readonly plan = () => {
    if (this.weg || this.gepland) return;
    this.gepland = requestAnimationFrame(() => {
      this.gepland = 0;
      if (!this.weg) this.renderer.render(this.wereld, this.camera);
    });
  };

  private readonly aanraking = () => {
    this.aangeraakt = true;
  };

  dispose() {
    if (this.weg) return;
    this.weg = true;
    if (this.gepland) cancelAnimationFrame(this.gepland);
    this.ro.disconnect();
    this.controls.dispose();
    if (this.model) ruimModelOp(this.model);
    this.model = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
