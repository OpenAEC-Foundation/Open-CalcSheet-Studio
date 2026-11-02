/*
 * De omgeving van een `@js`-blok. Draait in het afgeschermde venster (jsRegels.ts
 * zet dit bestand als inline script in de srcdoc), niet in de app. Dit bestand is
 * tekst voor dat venster: het importeert niets, en de app voert het zelf niet uit.
 *
 * Het maakt `calc`, laadt zo nodig een bibliotheek en voert dan de code van het
 * blok uit. Met de app praat het alleen via berichten:
 *
 *   naar de app   geladen, klaar, luistert, pong, fout, hoogte, afdruk, vraag-bibliotheek
 *   van de app    waarden, ping, afdruk, bibliotheek
 *
 * Wat de app ervan aanneemt, staat in `leesBericht` in jsRegels.ts. Alles hier is
 * gemak voor het script, geen beveiliging: de afscherming zit in de sandbox en de CSP.
 */
(function () {
  "use strict";
  var start = window.__calcStart;
  try { delete window.__calcStart; } catch (e) { /* niets */ }
  var ouder = window.parent;
  var waarden = start.waarden;
  var luisteraars = [];
  var bijAfdruk = null;
  var vasteAfdruk = null;
  var gefaald = false;

  function stuur(bericht) {
    try {
      ouder.postMessage(bericht, "*");
    } catch (e) { /* de app is er niet meer */ }
  }

  function meldFout(tekst) {
    gefaald = true;
    stuur({ soort: "fout", tekst: String(tekst).slice(0, 500) });
  }

  window.addEventListener("error", function (e) {
    meldFout((e.message || "Fout in het script") + (e.lineno ? " (regel " + e.lineno + ")" : ""));
  });
  window.addEventListener("unhandledrejection", function (e) {
    meldFout((e.reason && e.reason.message) || e.reason || "Fout in het script");
  });

  // Wat de app-omgeving in een venster kan zetten, hoort hier niet. De sandbox houdt
  // het al buiten; dit is voor de zekerheid.
  ["__TAURI__", "__TAURI_INTERNALS__", "__TAURI_IPC__", "__TAURI_INVOKE__", "ipc", "__ocs"].forEach(function (naam) {
    try { delete window[naam]; } catch (e) { /* niets */ }
  });
  if (!start.netwerk.length) {
    // Een verbinding buiten de CSP om; zonder `netwerk=` heeft niemand die nodig.
    ["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "RTCSessionDescription"].forEach(function (naam) {
      try { delete window[naam]; window[naam] = undefined; } catch (e) { /* niets */ }
    });
  }

  // WebGL drukt anders leeg af: de tekenbuffer is na het tekenen weer leeg.
  var getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (soort, opties) {
    if (/^(webgl2?|experimental-webgl)$/.test(soort)) opties = Object.assign({}, opties, { preserveDrawingBuffer: true });
    return getContext.call(this, soort, opties);
  };

  // ── Eenheden ────────────────────────────────────────────────────────────────
  // De dimensie is die van de rekenkern: massa, lengte, tijd, stroom, temperatuur,
  // lichtsterkte, stofhoeveelheid, hoek, bit.
  function dim(m, l, t, a) {
    return [m || 0, l || 0, t || 0, 0, 0, 0, 0, a || 0, 0];
  }
  var EENHEDEN = {
    m: [1, dim(0, 1)], g: [1e-3, dim(1)], s: [1, dim(0, 0, 1)], min: [60, dim(0, 0, 1)], h: [3600, dim(0, 0, 1)],
    t: [1000, dim(1)], ton: [1000, dim(1)], N: [1, dim(1, 1, -2)], Pa: [1, dim(1, -1, -2)], bar: [1e5, dim(1, -1, -2)],
    J: [1, dim(1, 2, -2)], Nm: [1, dim(1, 2, -2)], W: [1, dim(1, 2, -3)], rad: [1, dim(0, 0, 0, 1)], deg: [Math.PI / 180, dim(0, 0, 0, 1)],
  };
  var VOORVOEGSELS = { G: 1e9, M: 1e6, k: 1e3, d: 1e-1, c: 1e-2, m: 1e-3, u: 1e-6, "μ": 1e-6, n: 1e-9 };

  function eenDeel(deel) {
    var m = deel.match(/^([A-Za-zμ]+)(?:\^?(-?\d+))?$/);
    if (!m) return null;
    var e = EENHEDEN[m[1]];
    if (!e) {
      var f = VOORVOEGSELS[m[1][0]];
      var basis = EENHEDEN[m[1].slice(1)];
      if (!f || !basis) return null;
      e = [f * basis[0], basis[1]];
    }
    var macht = m[2] ? Number(m[2]) : 1;
    return { f: Math.pow(e[0], macht), d: e[1].map(function (x) { return x * macht; }) };
  }

  /** Leest `mm`, `kN/m`, `N/mm^2`, `kN*m`, `mm²`; geeft de factor naar SI en de dimensie. */
  function leesEenheid(tekst) {
    var t = String(tekst).replace(/²/g, "^2").replace(/³/g, "^3").replace(/⁴/g, "^4").replace(/·/g, "*").trim();
    var uit = { f: 1, d: dim() };
    var delen = t.split("/");
    for (var i = 0; i < delen.length; i++) {
      var factoren = delen[i].trim().split(/[*\s]+/);
      for (var j = 0; j < factoren.length; j++) {
        var e = eenDeel(factoren[j]);
        if (!e) throw new Error('Onbekende eenheid "' + tekst + '"');
        uit.f = i === 0 ? uit.f * e.f : uit.f / e.f;
        uit.d = uit.d.map(function (x, k) { return i === 0 ? x + e.d[k] : x - e.d[k]; });
      }
    }
    return uit;
  }

  var zelfde = function (a, b) {
    for (var k = 0; k < 9; k++) if (Math.abs((a[k] || 0) - (b[k] || 0)) > 1e-9) return false;
    return true;
  };
  var naamVan = function (naam) { return String(naam).replace(/[,.]/g, "_"); };
  var netjes = function (n) { return Number(n.toPrecision(12)); };

  function haal(naam) {
    var v = waarden[naamVan(naam)];
    if (!v) throw new Error('"' + naam + '" staat niet in het blad, of nog niet op deze plek');
    return v;
  }

  // ── calc ────────────────────────────────────────────────────────────────────
  var calc = {
    /** De namen van alle waarden van het blad op deze plek. */
    namen: function () { return Object.keys(waarden); },
    /** Een getal; met een eenheid omgerekend. Een kaal getal telt al in die eenheid. */
    getal: function (naam, eenheid) {
      var v = haal(naam);
      if (typeof v.w !== "number") throw new Error('"' + naam + '" is geen getal');
      if (eenheid === undefined || v.s === undefined) return v.w;
      var u = leesEenheid(eenheid);
      if (!zelfde(u.d, v.d)) throw new Error('"' + naam + '" (' + v.e + ") is niet om te rekenen naar " + eenheid);
      return netjes(v.s / u.f);
    },
    /** Alle getallen; wat naar `eenheid` kan, omgerekend, de rest zoals het blad het toont. */
    getallen: function (eenheid) {
      var u = eenheid === undefined ? null : leesEenheid(eenheid);
      var uit = {};
      Object.keys(waarden).forEach(function (naam) {
        var v = waarden[naam];
        if (typeof v.w !== "number") return;
        uit[naam] = u && v.s !== undefined && zelfde(u.d, v.d) ? netjes(v.s / u.f) : v.w;
      });
      return uit;
    },
    /** De waarde zoals het blad hem heeft: een getal, tekst, ja/nee of een lijst. */
    waarde: function (naam) { return haal(naam).w; },
    /** De eenheid zoals het blad hem toont; leeg zonder eenheid. */
    eenheid: function (naam) { return haal(naam).e || ""; },
    /** De waarde met eenheid als tekst. */
    tekst: function (naam) {
      var v = haal(naam);
      return v.e ? v.w + " " + v.e : String(v.w);
    },
    /** `fn` loopt bij nieuwe waarden, zonder dat het script opnieuw begint: de camera blijft staan. */
    bijWijziging: function (fn) {
      luisteraars.push(fn);
      stuur({ soort: "luistert" });
    },
    /** De afbeelding voor op papier: een canvas of een data:image/png. */
    afdruk: function (beeld) {
      vasteAfdruk = beeld;
    },
    /** Als `afdruk`, maar `fn` maakt de afbeelding pas als er wordt afgedrukt. */
    bijAfdruk: function (fn) {
      bijAfdruk = fn;
    },
    /** De hoogte van het venster op het scherm, in px. Op papier geldt `hoogte=`. */
    hoogte: function (px) {
      stuur({ soort: "hoogte", px: Number(px) });
    },
    /** Dit venster maakt de afbeelding voor papier. */
    opPapier: !!start.opPapier,
  };

  // ── Een draaibaar model (bibliotheek=three) ─────────────────────────────────
  calc.wereld3d = function (opties) {
    var T = window.THREE;
    if (!T) throw new Error("Schrijf bibliotheek=three op de regel @js");
    opties = opties || {};
    var papier = !!start.opPapier;
    var renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(papier ? 2.5 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(papier ? "#ffffff" : opties.achtergrond || "#fafaf9", 1);
    renderer.shadowMap.enabled = !papier;
    renderer.shadowMap.type = T.PCFShadowMap;
    var canvas = renderer.domElement;
    canvas.style.cssText = "display:block;width:100%;height:100%;cursor:grab;touch-action:none";
    document.documentElement.style.height = "100%";
    document.body.style.cssText += ";margin:0;height:100%;overflow:hidden";
    document.body.appendChild(canvas);

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(30, 2, 1, 1e7);
    camera.up.set(0, 0, 1);
    var model = new T.Group();
    scene.add(model);
    scene.add(new T.AmbientLight(0xffffff, 0.62 * Math.PI));
    var zon = new T.DirectionalLight(0xffffff, 0.4 * Math.PI);
    zon.castShadow = !papier;
    zon.shadow.mapSize.set(2048, 2048);
    zon.shadow.bias = -0.0005;
    scene.add(zon, zon.target);
    var vloer = new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShadowMaterial({ opacity: 0.14 }));
    vloer.receiveShadow = true;
    vloer.visible = !papier;
    scene.add(vloer);

    var controls = new window.OrbitControls(camera, canvas);
    controls.enableZoom = false;
    controls.screenSpacePanning = true;
    var doel = controls.target;
    var aangeraakt = false;
    var gepland = 0;

    function grenzen() {
      var box = new T.Box3();
      model.updateMatrixWorld(true);
      model.traverse(function (o) {
        if (o.isMesh) {
          box.expandByObject(o);
        } else if (o.isSprite) {
          // Een tekst telt mee met zijn breedte, zodat hij in beeld blijft.
          var p = o.getWorldPosition(new T.Vector3());
          var hb = o.scale.x / 2;
          var hh = o.scale.y / 2;
          box.expandByPoint(new T.Vector3(p.x - hb, p.y, p.z - hh));
          box.expandByPoint(new T.Vector3(p.x + hb, p.y, p.z + hh));
        }
      });
      return box;
    }

    function zetZon(box) {
      var midden = box.getCenter(new T.Vector3());
      var S = Math.max(box.getSize(new T.Vector3()).length(), 1);
      zon.position.copy(midden).add(new T.Vector3(0.35, -0.55, 1).normalize().multiplyScalar(S * 1.5));
      zon.target.position.copy(midden);
      var c = zon.shadow.camera;
      c.left = -S; c.right = S; c.top = S; c.bottom = -S; c.near = S * 0.1; c.far = S * 4;
      c.updateProjectionMatrix();
      vloer.position.set(midden.x, midden.y, box.min.z - S * 0.002);
      vloer.scale.set(S * 3, S * 3, 1);
    }

    /** Past het model in beeld, standaard schuin van voren; `richting` als [x, y, z] kan ook. */
    function pasIn(richting) {
      var box = grenzen();
      if (box.isEmpty()) return;
      var r = new T.Vector3().fromArray(richting || [0.9, -1.6, 1.05]).normalize();
      var vooruit = r.clone().negate();
      var rechts = new T.Vector3().crossVectors(vooruit, new T.Vector3(0, 0, 1));
      if (rechts.lengthSq() < 1e-9) rechts.set(1, 0, 0);
      rechts.normalize();
      var boven = new T.Vector3().crossVectors(rechts, vooruit).normalize();
      box.getCenter(doel);
      var tanV = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
      var tanH = tanV * camera.aspect;
      var d = 0;
      var q = new T.Vector3();
      [box.min.x, box.max.x].forEach(function (x) {
        [box.min.y, box.max.y].forEach(function (y) {
          [box.min.z, box.max.z].forEach(function (z) {
            q.set(x, y, z).sub(doel);
            var diepte = q.dot(r);
            d = Math.max(d, diepte + Math.abs(q.dot(rechts)) / tanH, diepte + Math.abs(q.dot(boven)) / tanV);
          });
        });
      });
      d = Math.max(d * 1.08, 1e-3);
      camera.position.copy(doel).addScaledVector(r, d);
      camera.near = d / 100;
      camera.far = d * 40;
      camera.lookAt(doel);
      camera.updateProjectionMatrix();
      controls.minDistance = d * 0.02;
      controls.maxDistance = d * 10;
      controls.update();
    }

    function render() {
      gepland = 0;
      renderer.render(scene, camera);
    }

    /** Tekent het model. Zolang niemand aan de camera zat, past het in beeld. */
    function teken() {
      var box = grenzen();
      if (!box.isEmpty()) zetZon(box);
      if (!aangeraakt) pasIn(opties.richting);
      render();
    }

    function maat() {
      var b = window.innerWidth;
      var h = window.innerHeight;
      if (b > 0 && h > 0) {
        renderer.setSize(b, h, false);
        camera.aspect = b / h;
        camera.updateProjectionMatrix();
      }
      teken();
    }
    window.addEventListener("resize", maat);

    controls.addEventListener("change", function () {
      if (!gepland) gepland = requestAnimationFrame(render);
    });
    controls.addEventListener("start", function () { aangeraakt = true; });
    // Zoomen pas na een klik in het beeld: anders blijft de uitwerking erin hangen.
    canvas.addEventListener("pointerdown", function () {
      controls.enableZoom = true;
      canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointerup", function () { canvas.style.cursor = "grab"; });
    function zoomUit() { controls.enableZoom = false; }
    canvas.addEventListener("pointerleave", zoomUit);
    document.documentElement.addEventListener("mouseleave", zoomUit);
    window.addEventListener("blur", zoomUit);
    canvas.addEventListener("wheel", function () { if (controls.enableZoom) aangeraakt = true; }, { passive: true });

    var materialen = {};
    function materiaal(kleur) {
      if (kleur && kleur.isMaterial) return kleur;
      var k = kleur || "#e3c08a";
      if (!materialen[k]) {
        materialen[k] = new T.MeshLambertMaterial({ color: new T.Color(k), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      }
      return materialen[k];
    }

    /** Voegt iets toe aan het model; een mesh krijgt schaduw. Geeft het eerste terug. */
    function voegToe() {
      for (var i = 0; i < arguments.length; i++) {
        var o = arguments[i];
        o.traverse(function (d) { if (d.isMesh) { d.castShadow = !papier; d.receiveShadow = !papier; } });
        model.add(o);
      }
      return arguments[0];
    }

    /** Een mesh met zijn scherpe randen erbij. */
    function metRanden(geometrie, kleur) {
      var mat = materiaal(kleur);
      var mesh = new T.Mesh(geometrie, mat);
      var lijn = new T.Color().copy(mat.color).multiplyScalar(0.42);
      mesh.add(new T.LineSegments(new T.EdgesGeometry(geometrie, 20), new T.LineBasicMaterial({ color: lijn })));
      return voegToe(mesh);
    }

    /** Een blok tussen twee hoeken: doos([x0, y0, z0], [x1, y1, z1], kleur). */
    function doos(van, naar, kleur) {
      var g = new T.BoxGeometry(Math.abs(naar[0] - van[0]) || 1e-6, Math.abs(naar[1] - van[1]) || 1e-6, Math.abs(naar[2] - van[2]) || 1e-6);
      var m = metRanden(g, kleur);
      m.position.set((van[0] + naar[0]) / 2, (van[1] + naar[1]) / 2, (van[2] + naar[2]) / 2);
      return m;
    }

    /** Een pijl met de punt op `naar`. */
    function pijl(van, naar, kleur) {
      var a = new T.Vector3().fromArray(van);
      var b = new T.Vector3().fromArray(naar);
      var richting = b.clone().sub(a);
      var L = richting.length();
      if (!(L > 0)) return null;
      var e = richting.clone().normalize();
      var groep = new T.Group();
      var kop = L * 0.28;
      var mat = materiaal(kleur || "#d97706");
      var schacht = new T.Mesh(new T.CylinderGeometry(kop * 0.1, kop * 0.1, L - kop, 10), mat);
      schacht.position.copy(a).addScaledVector(e, (L - kop) / 2);
      schacht.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), e);
      var punt = new T.Mesh(new T.ConeGeometry(kop * 0.36, kop, 16), mat);
      punt.position.copy(b).addScaledVector(e, -kop / 2);
      punt.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), e);
      groep.add(schacht, punt);
      model.add(groep);
      return groep;
    }

    /** Een tekst die altijd naar de kijker staat; `grootte` in de maat van het model. */
    function label(tekst, plek, grootte, kleur) {
      var px = 64;
      var doek = document.createElement("canvas");
      var ctx = doek.getContext("2d");
      var font = '600 ' + px + 'px "Segoe UI", system-ui, sans-serif';
      ctx.font = font;
      doek.width = Math.ceil(ctx.measureText(tekst).width) + 28;
      doek.height = px + 28;
      ctx.font = font;
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = 10;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.strokeText(tekst, 14, doek.height / 2);
      ctx.fillStyle = kleur || "#1c1917";
      ctx.fillText(tekst, 14, doek.height / 2);
      var tex = new T.CanvasTexture(doek);
      tex.colorSpace = T.SRGBColorSpace;
      var s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      var h = grootte || 200;
      s.scale.set((h * doek.width) / doek.height, h, 1);
      s.position.fromArray(plek);
      s.renderOrder = 10;
      model.add(s);
      return s;
    }

    /** Haalt het hele model weg, om het bij nieuwe waarden opnieuw op te bouwen. */
    function leeg() {
      model.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.isSprite || o.isLine) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
      model.clear();
    }

    calc.bijAfdruk(function () {
      maat();
      return canvas;
    });
    maat();
    return {
      scene: scene, camera: camera, renderer: renderer, controls: controls, model: model, canvas: canvas,
      voegToe: voegToe, doos: doos, pijl: pijl, label: label, materiaal: materiaal, metRanden: metRanden, leeg: leeg,
      pasIn: pasIn, teken: teken,
    };
  };

  window.calc = Object.freeze(calc);

  // ── Berichten van de app ────────────────────────────────────────────────────
  function naarPng(beeld) {
    if (typeof beeld === "string") return beeld;
    if (beeld && typeof beeld.toDataURL === "function") return beeld.toDataURL("image/png");
    return null;
  }

  function grootsteCanvas() {
    var beste = null;
    var oppervlak = 0;
    document.querySelectorAll("canvas").forEach(function (c) {
      if (c.width * c.height > oppervlak) {
        beste = c;
        oppervlak = c.width * c.height;
      }
    });
    return beste;
  }

  /** Staat er iets om af te drukken, naast de scripts van dit venster? */
  function heeftInhoud() {
    var kinderen = document.body.childNodes;
    for (var i = 0; i < kinderen.length; i++) {
      var k = kinderen[i];
      if (k.nodeType === 1 && k.tagName !== "SCRIPT") return true;
      if (k.nodeType === 3 && k.data.trim() !== "") return true;
    }
    return false;
  }

  function maakAfdruk(id) {
    new Promise(function (klaar) {
      if (bijAfdruk) klaar(bijAfdruk());
      else klaar(vasteAfdruk || grootsteCanvas());
    }).then(function (beeld) {
      stuur({ soort: "afdruk", id: id, dataUrl: naarPng(beeld), mislukt: gefaald, leeg: !heeftInhoud() });
    }).catch(function (e) {
      meldFout(e && e.message);
      stuur({ soort: "afdruk", id: id, dataUrl: null, mislukt: true, leeg: !heeftInhoud() });
    });
  }

  var bibliotheek = null;
  window.addEventListener("message", function (e) {
    if (e.source !== ouder || !e.data) return;
    var b = e.data;
    if (b.soort === "ping") {
      stuur({ soort: "pong" });
    } else if (b.soort === "waarden") {
      waarden = b.waarden;
      luisteraars.forEach(function (fn) {
        try {
          fn(calc);
        } catch (err) {
          meldFout(err && err.message);
        }
      });
    } else if (b.soort === "afdruk") {
      maakAfdruk(b.id);
    } else if (b.soort === "bibliotheek" && bibliotheek) {
      bibliotheek(b.delen);
    }
  });

  // ── Bibliotheek, en dan de code ─────────────────────────────────────────────
  function alsModule(tekst) {
    return URL.createObjectURL(new Blob([tekst], { type: "text/javascript" }));
  }

  function laadDrie(delen) {
    var core = alsModule(delen.core);
    var module = alsModule(delen.module.split("./three.core.js").join(core));
    var orbit = alsModule(delen.orbit.replace(/from\s+['"]three['"]/g, "from '" + module + "'"));
    return Promise.all([import(module), import(orbit)]).then(function (m) {
      window.THREE = m[0];
      window.OrbitControls = m[1].OrbitControls;
    });
  }

  function voerUit() {
    var s = document.createElement("script");
    s.textContent = start.code;
    document.body.appendChild(s);
    s.remove();
    stuur({ soort: "klaar", luistert: luisteraars.length > 0 });
  }

  stuur({ soort: "geladen" });
  if (start.bibliotheken.indexOf("three") >= 0) {
    new Promise(function (klaar) {
      bibliotheek = klaar;
      stuur({ soort: "vraag-bibliotheek", naam: "three" });
    }).then(laadDrie).then(voerUit).catch(function (e) {
      meldFout("De bibliotheek laadde niet: " + (e && e.message));
      stuur({ soort: "klaar", luistert: false });
    });
  } else {
    voerUit();
  }
})();
