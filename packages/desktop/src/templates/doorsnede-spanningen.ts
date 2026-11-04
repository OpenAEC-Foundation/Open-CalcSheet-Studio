/**
 * Spanningen in een doorsnede: mechanica, geen normtoets. Eén blad waarin je een vorm kiest,
 * de maten en de snedekrachten invult en het lineair-elastische spanningsverloop ziet.
 *
 * Toepassing, tekenafspraak en de regels voor de schuifspanning staan in
 * docs/doorsnede-spanningen.md, de handberekeningen in scripts/check-doorsnede.mjs. Het beeld
 * (DoorsnedeDesigner.tsx) tekent uit dezelfde invoer en leest de uitkomsten onafgerond uit dit
 * blad; de maten van de doorsnede gaan langs dezelfde functies van de rekenkern.
 *
 * Assen: x langs de staaf, y naar rechts, z omlaag, oorsprong in het zwaartepunt. De rekenkern
 * (doorsnede.ts) telt z omhoog: de lijn op z heet daar z_k - z en de tabel met de delen staat
 * in die assen, zo dat de flens van een T boven ligt en de rug van een U links.
 *
 * Geen oordeel zonder grenswaarde: de uitkomst is dan alleen de spanning. Met een grenswaarde
 * f_y beslist de onafgeronde UC_h; UC_max is de weergave en rondt naar boven af.
 *
 * De rekenlussen tellen in kale getallen, N en mm: dat scheelt de eenheden in elke ronde. Op
 * papier beknopt: invoer in kolommen en de plekken in één tabel. Uitleg alleen op het scherm.
 */

export const doorsnedeSpanningen = `"Spanningen in een doorsnede — lineair-elastisch

'<i>Kies een vorm, vul de maten en de snedekrachten in en lees het spanningsverloop af. Alles komt uit de maten, niet uit tabellen. Dit is mechanica, geen normtoets: er zit geen materiaal in en het blad geeft alleen een oordeel als je een grenswaarde invult.</i><span class="alleen-scherm"></span>

#hide
'Naar boven afgerond: 1,004 staat er als 1,01 en nooit als 1,00.
ru(u) = ceil(u*100)/100
#show

# 1. Invoer

@select vorm "Vorm"
  I of H = 1
  Rechthoek = 2
  Rond, massief = 3
  Buis, rond = 4
  Koker, rechthoekig = 5
  T, flens boven = 6
  U, rug links = 7
@end
#if vorm ≡ 1
    @select profiel "Profiel"
      Eigen maten = 0
      HEA 100 = 1
      HEA 120 = 2
      HEA 140 = 3
      HEA 160 = 4
      HEA 180 = 5
      HEA 200 = 6
      HEA 220 = 7
      HEA 240 = 8
      HEA 260 = 9
      HEA 300 = 10
      HEB 100 = 11
      HEB 120 = 12
      HEB 140 = 13
      HEB 160 = 14
      HEB 180 = 15
      HEB 200 = 16
      HEB 220 = 17
      HEB 240 = 18
      HEB 260 = 19
      HEB 300 = 20
      IPE 200 = 21
      IPE 240 = 22
      IPE 270 = 23
      IPE 300 = 24
      IPE 330 = 25
      IPE 360 = 26
      IPE 400 = 27
    @end
    #if profiel ≡ 0
        h = ?*(mm)', hoogte<span class="kolom-3"></span>'
        b = ?*(mm)', flensbreedte<span class="kolom-3"></span>'
        t_w = ?*(mm)', lijfdikte<span class="kolom-3"></span>'
        t_f = ?*(mm)', flensdikte<span class="kolom-3"></span>'
        r = ?*(mm)', afrondingsstraal<span class="kolom-3"></span>'
    #else
        #hide
        'Profieltabel uit profielen.ts: id | h (mm) | b (mm) | t_w (mm) | t_f (mm) | r (mm) | A (cm²) | I_y (cm⁴) | W_el,y (cm³) | W_pl,y (cm³) | i_y (cm) | A_v,z (cm²) | I_z (cm⁴) | W_el,z (cm³) | W_pl,z (cm³) | i_z (cm) | I_t (cm⁴) | I_w (cm⁶)
        profielen = [1; 2; 3; 4; 5; 6; 7; 8; 9; 10; 11; 12; 13; 14; 15; 16; 17; 18; 19; 20; 21; 22; 23; 24; 25; 26; 27 |96; 114; 133; 152; 171; 190; 210; 230; 250; 290; 100; 120; 140; 160; 180; 200; 220; 240; 260; 300; 200; 240; 270; 300; 330; 360; 400 |100; 120; 140; 160; 180; 200; 220; 240; 260; 300; 100; 120; 140; 160; 180; 200; 220; 240; 260; 300; 100; 120; 135; 150; 160; 170; 180 |5; 5; 5.5; 6; 6; 6.5; 7; 7.5; 7.5; 8.5; 6; 6.5; 7; 8; 8.5; 9; 9.5; 10; 10; 11; 5.6; 6.2; 6.6; 7.1; 7.5; 8; 8.6 |8; 8; 8.5; 9; 9.5; 10; 11; 12; 12.5; 14; 10; 11; 12; 13; 14; 15; 16; 17; 17.5; 19; 8.5; 9.8; 10.2; 10.7; 11.5; 12.7; 13.5 |12; 12; 12; 15; 15; 18; 18; 21; 24; 27; 12; 12; 12; 15; 15; 18; 18; 21; 24; 27; 12; 15; 15; 15; 18; 18; 21 |21.24; 25.34; 31.42; 38.77; 45.25; 53.83; 64.34; 76.84; 86.82; 112.5; 26.04; 34.01; 42.96; 54.25; 65.25; 78.08; 91.04; 106; 118.4; 149.1; 28.48; 39.12; 45.95; 53.81; 62.61; 72.73; 84.46 |349.2; 606.2; 1033; 1673; 2510; 3692; 5410; 7763; 10450; 18260; 449.5; 864.4; 1509; 2492; 3831; 5696; 8091; 11260; 14920; 25170; 1943; 3892; 5790; 8356; 11770; 16270; 23130 |72.76; 106.3; 155.4; 220.1; 293.6; 388.6; 515.2; 675.1; 836.4; 1260; 89.91; 144.1; 215.6; 311.5; 425.7; 569.6; 735.5; 938.3; 1148; 1678; 194.3; 324.3; 428.9; 557.1; 713.1; 903.6; 1156 |83.01; 119.5; 173.5; 245.1; 324.9; 429.5; 568.5; 744.6; 919.8; 1383; 104.2; 165.2; 245.4; 354; 481.4; 642.5; 827; 1053; 1283; 1869; 220.6; 366.6; 484; 628.4; 804.3; 1019; 1307 |4.06; 4.89; 5.73; 6.57; 7.45; 8.28; 9.17; 10.05; 10.97; 12.74; 4.16; 5.04; 5.93; 6.78; 7.66; 8.54; 9.43; 10.31; 11.22; 12.99; 8.26; 9.97; 11.23; 12.46; 13.71; 14.95; 16.55 |7.56; 8.46; 10.12; 13.21; 14.47; 18.08; 20.67; 25.18; 28.76; 37.28; 9.04; 10.96; 13.08; 17.59; 20.24; 24.83; 27.92; 33.23; 37.59; 47.43; 14; 19.14; 22.14; 25.68; 30.81; 35.14; 42.69 |133.8; 230.9; 389.3; 615.6; 924.6; 1336; 1955; 2769; 3668; 6310; 167.3; 317.5; 549.7; 889.2; 1363; 2003; 2843; 3923; 5135; 8563; 142.4; 283.6; 419.9; 603.8; 788.1; 1043; 1318 |26.76; 38.48; 55.62; 76.95; 102.7; 133.6; 177.7; 230.7; 282.1; 420.6; 33.45; 52.92; 78.52; 111.2; 151.4; 200.3; 258.5; 326.9; 395; 570.9; 28.47; 47.27; 62.2; 80.5; 98.52; 122.8; 146.4 |41.14; 58.85; 84.85; 117.6; 156.5; 203.8; 270.6; 351.7; 430.2; 641.2; 51.42; 80.97; 119.8; 170; 231; 305.8; 393.9; 498.4; 602.2; 870.1; 44.61; 73.92; 96.95; 125.2; 153.7; 191.1; 229 |2.51; 3.02; 3.52; 3.98; 4.52; 4.98; 5.51; 6; 6.5; 7.49; 2.53; 3.06; 3.58; 4.05; 4.57; 5.07; 5.59; 6.08; 6.58; 7.58; 2.24; 2.69; 3.02; 3.35; 3.55; 3.79; 3.95 |5.24; 5.99; 8.13; 12.19; 14.8; 20.98; 28.46; 41.55; 52.37; 85.17; 9.25; 13.84; 20.06; 31.24; 42.16; 59.28; 76.57; 102.7; 123.8; 185; 6.98; 12.88; 15.94; 20.12; 28.15; 37.32; 51.08 |2580; 6470; 15060; 31410; 60210; 108000; 193300; 328500; 516400; 1200000; 3380; 9410; 22480; 47940; 93750; 171100; 295400; 486900; 753700; 1688000; 12990; 37390; 70580; 125900; 199100; 313600; 490000]
        h = hlookup(profielen; profiel; 1; 2)*mm
        b = hlookup(profielen; profiel; 1; 3)*mm
        t_w = hlookup(profielen; profiel; 1; 4)*mm
        t_f = hlookup(profielen; profiel; 1; 5)*mm
        r = hlookup(profielen; profiel; 1; 6)*mm
        #show
        h', hoogte<span class="kolom-3"></span>'
        b', flensbreedte<span class="kolom-3"></span>'
        t_w', lijfdikte<span class="kolom-3"></span>'
        t_f', flensdikte<span class="kolom-3"></span>'
        r', afrondingsstraal<span class="kolom-3"></span>'
    #end if
    #hide
    ok_m = bool(h > 0 mm)*bool(b > 0 mm)*bool(t_w > 0 mm)*bool(t_f > 0 mm)*bool(r ≥ 0 mm)*bool(2*t_f < h)*bool(t_w < b)*bool(2*r ≤ b - t_w)*bool(2*r ≤ h - 2*t_f)
    #show
#else if vorm ≡ 2
    b = ?*(mm)', breedte<span class="kolom-3"></span>'
    h = ?*(mm)', hoogte<span class="kolom-3"></span>'
    #hide
    ok_m = bool(b > 0 mm)*bool(h > 0 mm)
    #show
#else if vorm ≡ 3
    D = ?*(mm)', diameter<span class="kolom-3"></span>'
    #hide
    ok_m = bool(D > 0 mm)
    #show
#else if vorm ≡ 4
    D = ?*(mm)', diameter<span class="kolom-3"></span>'
    t = ?*(mm)', wanddikte<span class="kolom-3"></span>'
    #hide
    ok_m = bool(D > 0 mm)*bool(t > 0 mm)*bool(2*t < D)
    #show
#else if vorm ≡ 5
    b = ?*(mm)', breedte<span class="kolom-3"></span>'
    h = ?*(mm)', hoogte<span class="kolom-3"></span>'
    t_w = ?*(mm)', dikte van de staande wanden<span class="kolom-3"></span>'
    t_f = ?*(mm)', dikte van de liggende wanden<span class="kolom-3"></span>'
    #hide
    ok_m = bool(b > 0 mm)*bool(h > 0 mm)*bool(t_w > 0 mm)*bool(t_f > 0 mm)*bool(2*t_w < b)*bool(2*t_f < h)
    #show
#else if vorm ≡ 6
    b = ?*(mm)', flensbreedte<span class="kolom-3"></span>'
    h = ?*(mm)', hoogte<span class="kolom-3"></span>'
    t_w = ?*(mm)', lijfdikte<span class="kolom-3"></span>'
    t_f = ?*(mm)', flensdikte<span class="kolom-3"></span>'
    #hide
    ok_m = bool(b > 0 mm)*bool(h > 0 mm)*bool(t_w > 0 mm)*bool(t_f > 0 mm)*bool(t_w < b)*bool(t_f < h)
    #show
#else
    b = ?*(mm)', breedte<span class="kolom-3"></span>'
    h = ?*(mm)', hoogte<span class="kolom-3"></span>'
    t_w = ?*(mm)', dikte van de rug<span class="kolom-3"></span>'
    t_f = ?*(mm)', flensdikte<span class="kolom-3"></span>'
    #hide
    ok_m = bool(b > 0 mm)*bool(h > 0 mm)*bool(t_w > 0 mm)*bool(t_f > 0 mm)*bool(t_w < b)*bool(2*t_f < h)
    #show
#end if

'<h6>Snedekrachten</h6>
N_x = ?*(kN)', normaalkracht<span class="kolom-3"></span>'
M_y = ?*(kN*m)', moment om de y-as<span class="kolom-3"></span>'
M_z = ?*(kN*m)', moment om de z-as<span class="kolom-3"></span>'
V_y = ?*(kN)', dwarskracht langs y<span class="kolom-3"></span>'
V_z = ?*(kN)', dwarskracht langs z<span class="kolom-3"></span>'
f_y = ?*(N/mm^2)', grenswaarde<span class="alleen-scherm">, voor de benuttingsgraad; 0 = geen</span><span class="kolom-3"></span>'
'<i class="ook-afdruk">Assen: x langs de staaf, y naar rechts, z omlaag, de oorsprong in het zwaartepunt. Positief is N<sub>x</sub> als trek, M<sub>y</sub> met trek aan de kant van +z (onder), M<sub>z</sub> met trek aan de kant van +y (rechts), en V<sub>y</sub> en V<sub>z</sub> in de richting van +y en +z.</i>

#hide
ok_g = bool(f_y ≥ 0 N/mm^2)
#show

#if ok_m*ok_g ≡ 1
    #hide
    'De delen van de doorsnede, per kolom een deel; assen van de rekenkern: y naar rechts, z omhoog.
    wand = bool(vorm ≡ 1) + bool(vorm ≥ 5)
    rond_s = bool(vorm ≡ 3) + bool(vorm ≡ 4)
    #if vorm ≡ 1
        delen = [3 | h | b | t_w | t_f | r | 0 | 0 | 1 | 0]
    #else if vorm ≡ 2
        delen = [1 | b | h | 0 | 0 | 0 | 0 | 0 | 1 | 0]
    #else if vorm ≡ 3
        delen = [2 | D | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0]
    #else if vorm ≡ 4
        delen = [2 | D | t | 0 | 0 | 0 | 0 | 0 | 1 | 0]
    #else if vorm ≡ 5
        delen = [1; 1 | b; b - 2*t_w | h; h - 2*t_f | 0; 0 | 0; 0 | 0; 0 | 0; 0 | 0; 0 | 1; -1 | 0; 0]
    #else if vorm ≡ 6
        delen = [1; 1 | b; t_w | t_f; h - t_f | 0; 0 | 0; 0 | 0; 0 | 0; 0 | (h - t_f)/2; -t_f/2 | 1; 1 | 0; 0]
    #else
        delen = [1; 1; 1 | t_w; b - t_w; b - t_w | h; t_f; t_f | 0; 0; 0 | 0; 0; 0 | 0; 0; 0 | (t_w - b)/2; t_w/2; t_w/2 | 0; (h - t_f)/2; (t_f - h)/2 | 1; 1; 1 | 0; 0; 0]
    #end if
    ds = doorsnede(delen)
    y_k = ds.2
    z_k = ds.3
    e_l = ds.2 - ds.7
    e_r = ds.8 - ds.2
    e_t = ds.10 - ds.3
    e_o = ds.3 - ds.9
    A = ds.1*mm^2
    y_c = e_l*mm
    z_c = e_t*mm
    I_y = ds.4*mm^4 to cm^4
    I_z = ds.5*mm^4 to cm^4
    e_y = max(e_t; e_o)*mm
    e_z = max(e_l; e_r)*mm
    S_ym = doorsnede_S(delen; 1; z_k)
    S_zm = doorsnede_S(delen; 2; y_k)
    S_y = S_ym.1*mm^3 to cm^3
    S_z = S_zm.1*mm^3 to cm^3
    #show

    # 2. Doorsnede

    A', oppervlak<span class="kolom-3"></span>'
    y_c', <span class="alleen-scherm">zwaartepunt, </span>vanaf links<span class="kolom-3"></span>'
    z_c', <span class="alleen-scherm">zwaartepunt, </span>vanaf boven<span class="kolom-3"></span>'
    I_y', om de y-as<span class="kolom-3"></span>'
    W_y = I_y/e_y to cm^3', kleinste, om de y-as<span class="alleen-scherm"></span>'
    W_y', kleinste<span class="alleen-afdruk"></span><span class="kolom-3"></span>'
    S_y', boven de y-as<span class="kolom-3"></span>'
    I_z', om de z-as<span class="kolom-3"></span>'
    W_z = I_z/e_z to cm^3', kleinste, om de z-as<span class="alleen-scherm"></span>'
    W_z', kleinste<span class="alleen-afdruk"></span><span class="kolom-3"></span>'
    S_z', naast de z-as<span class="kolom-3"></span>'

    # 3. Normaalspanning

    'σ(y, z) = N<sub>x</sub>/A + M<sub>y</sub>·z/I<sub>y</sub> + M<sub>z</sub>·y/I<sub>z</sub>
    σ_N = N_x/A to N/mm^2'<span class="alleen-scherm"></span>'
    k_y = M_y/I_y to N/mm^3'<span class="alleen-scherm"></span>'
    k_z = M_z/I_z to N/mm^3'<span class="alleen-scherm"></span>'
    σ_N'<span class="alleen-afdruk"></span><span class="kolom-3"></span>'
    k_y'<span class="alleen-afdruk"></span><span class="kolom-3"></span>'
    k_z'<span class="alleen-afdruk"></span><span class="kolom-3"></span>'

    #hide
    'Kale getallen in N en mm: het rooster en de rekenkern rekenen daarmee.
    s_0 = σ_N/(1 N/mm^2)
    k_1 = k_y/(1 N/mm^3)
    k_2 = k_z/(1 N/mm^3)
    V_1 = V_y/(1 N)
    V_2 = V_z/(1 N)
    I_1 = I_y/(1 mm^4)
    I_2 = I_z/(1 mm^4)
    A_m = A/(1 mm^2)
    K_m = sqrt(k_1^2 + k_2^2)
    σ_p(y; z) = s_0 + k_1*z + k_2*y

    'De uiterste vezels: een hoekpunt van de omtrek, of op de cirkel de plek in de richting van de gradiënt.
    #if rond_s ≥ 1
        R_m = D/2/(1 mm)
        y_x = if(K_m > 0; R_m*k_2/K_m; 0)
        z_x = if(K_m > 0; R_m*k_1/K_m; R_m)
        y_n = -y_x
        z_n = -z_x
    #else
        b_m = b/(1 mm)
        h_m = h/(1 mm)
        #if vorm ≡ 6
            t_1 = t_w/(1 mm)
            t_2 = t_f/(1 mm)
            H_p = [-b_m/2; b_m/2; b_m/2; -b_m/2; t_1/2; -t_1/2 | -e_t; -e_t; t_2 - e_t; t_2 - e_t; e_o; e_o]
            n_h = 6
        #else
            H_p = [-e_l; e_r; e_r; -e_l | -e_t; -e_t; e_o; e_o]
            n_h = 4
        #end if
        s_x = σ_p(H_p.(1; 1); H_p.(2; 1))
        s_n = s_x
        y_x = H_p.(1; 1)
        z_x = H_p.(2; 1)
        y_n = y_x
        z_n = z_x
        #for i = 2 : n_h
            y_i = H_p.(1; i)
            z_i = H_p.(2; i)
            s_i = σ_p(y_i; z_i)
            #if s_i > s_x
                s_x = s_i
                y_x = y_i
                z_x = z_i
            #end if
            #if s_i < s_n
                s_n = s_i
                y_n = y_i
                z_n = z_i
            #end if
        #loop
    #end if
    y_mx = y_x*mm
    z_mx = z_x*mm
    y_mn = y_n*mm
    z_mn = z_n*mm
    #show
    σ_max = σ_N + k_y*z_mx + k_z*y_mx to N/mm^2', grootste<span class="alleen-scherm"></span>'
    σ_min = σ_N + k_y*z_mn + k_z*y_mn to N/mm^2', kleinste<span class="alleen-scherm"></span>'
    σ_max', grootste<span class="alleen-afdruk"></span><span class="kolom-2"></span>'
    σ_min', kleinste<span class="alleen-afdruk"></span><span class="kolom-2"></span>'
    #if K_m > 0
        e_n = abs(σ_N)/sqrt(k_y^2 + k_z^2) to mm', neutrale lijn, afstand tot het zwaartepunt<span class="alleen-scherm"></span>'
        e_n', neutrale lijn, afstand tot het zwaartepunt<span class="alleen-afdruk"></span><span class="kolom-2"></span>'
        #hide
        a_n = atan2(-k_2; k_1)*180/π
        α_n = if(a_n > 90; a_n - 180; if(a_n ≤ -90; a_n + 180; a_n))*(1 deg)
        #show
        α_n', neutrale lijn, hoek met de y-as<span class="alleen-scherm">, met de klok mee</span><span class="kolom-2"></span>'
        #if σ_max*σ_min < 0 N^2/mm^4
            '<i>De neutrale lijn gaat door de doorsnede.</i><span class="alleen-scherm"></span>
        #else if σ_min ≥ 0 N/mm^2
            '<i>De neutrale lijn ligt buiten de doorsnede: alles staat op trek.</i><span class="alleen-scherm"></span>
        #else
            '<i>De neutrale lijn ligt buiten de doorsnede: alles staat op druk.</i><span class="alleen-scherm"></span>
        #end if
    #else
        '<i>Geen moment, dus geen neutrale lijn: de spanning is overal N<sub>x</sub>/A.</i><span class="alleen-scherm"></span>
    #end if

    # 4. Schuifspanning uit dwarskracht

    #hide
    'S/b op een lijn; op een sprong in de breedte telt de kleinste kant (doorsnede.ts).
    q_m(m) = if(m.2 > 0; m.1/m.2; 0)
    q_z(s) = q_m(doorsnede_S(delen; 1; s))
    q_y(s) = q_m(doorsnede_S(delen; 2; s))
    τ_2(z) = abs(V_2)*q_z(z_k - z)/I_1
    τ_1(y) = abs(V_1)*q_y(y_k + y)/I_2
    'De lijnen waar de hoogste waarde kan liggen: de zwaartelijn en de overgang van lijf naar flens.
    s_1z = z_k
    s_1y = y_k
    #if vorm ≡ 1
        s_1y = y_k + (t_w/2 + r)/(1 mm)
    #else if vorm ≡ 6
        s_1z = ds.10 - t_2
    #else if vorm ≡ 7
        s_1y = ds.7 + t_w/(1 mm)
    #end if
    q_zx = q_z(z_k)
    s_zx = z_k
    q_yx = q_y(y_k)
    s_yx = y_k
    #if q_z(s_1z) > q_zx
        q_zx = q_z(s_1z)
        s_zx = s_1z
    #end if
    #if q_y(s_1y) > q_yx
        q_yx = q_y(s_1y)
        s_yx = s_1y
    #end if
    'Daarna langs de hele doorsnede, en fijner rond de hoogste plek.
    d_z = (ds.10 - ds.9)/60
    d_y = (ds.8 - ds.7)/60
    #for i = 0 : 60
        s_i = ds.9 + i*d_z
        q_i = q_z(s_i)
        #if q_i > q_zx
            q_zx = q_i
            s_zx = s_i
        #end if
        s_i = ds.7 + i*d_y
        q_i = q_y(s_i)
        #if q_i > q_yx
            q_yx = q_i
            s_yx = s_i
        #end if
    #loop
    s_cz = s_zx
    s_cy = s_yx
    #for i = 0 : 20
        s_i = s_cz + (i - 10)*d_z/10
        q_i = q_z(s_i)
        #if q_i > q_zx
            q_zx = q_i
            s_zx = s_i
        #end if
        s_i = s_cy + (i - 10)*d_y/10
        q_i = q_y(s_i)
        #if q_i > q_yx
            q_yx = q_i
            s_yx = s_i
        #end if
    #loop
    S_mz = doorsnede_S(delen; 1; s_zx)
    S_my = doorsnede_S(delen; 2; s_yx)
    S_τz = S_mz.1*mm^3 to cm^3
    b_τz = S_mz.2*mm
    S_τy = S_my.1*mm^3 to cm^3
    b_τy = S_my.2*mm
    #show
    'τ = V·S/(I·b), per koorde volgens Jourawsky. S is het statisch moment van het deel voorbij de koorde, b de breedte van de koorde.
    τ_z,max = abs(V_z)*S_τz/(I_y*b_τz) to N/mm^2', uit V<sub>z</sub>'
    τ_y,max = abs(V_y)*S_τy/(I_z*b_τy) to N/mm^2', uit V<sub>y</sub>'
    '<i>De koorde met de hoogste waarde: de zwaartelijn, of bij een T of U de overgang naar de flens als de koorde daar smaller is.</i><span class="alleen-scherm"></span>

    # 5. Vergelijkingsspanning

    #hide
    'De plekken langs de wanden of door de hele doorsnede. Per groep de hoogste, met zijn y, z, σ en τ.
    v_f = 0
    y_f = 0
    z_f = 0
    s_f = 0
    τ_f = 0
    v_w = 0
    y_w = 0
    z_w = 0
    s_w = 0
    τ_w = 0
    τ_x = 0
    τ_n = 0
    τ_0 = 0
    #if wand ≡ 1
        t_1 = t_w/(1 mm)
        t_2 = t_f/(1 mm)
        τ_10 = τ_1(0)
        #if vorm ≡ 1
            y_r = t_1/2 + r/(1 mm)
            e_f = (h_m - t_2)/2
            a_f(y) = (b_m/2 - abs(y))*e_f
            τ_lf(z) = sqrt(τ_2(z)^2 + τ_10^2)
            F_l = [y_r; y_r; y_r; y_r; -y_r; -y_r; -y_r; -y_r | b_m/2; b_m/2; b_m/2; b_m/2; -b_m/2; -b_m/2; -b_m/2; -b_m/2 | -e_t; t_2 - e_t; e_o - t_2; e_o; -e_t; t_2 - e_t; e_o - t_2; e_o]
            n_f = 8
            W_l = [-t_1/2; t_1/2 | t_2 - e_t; t_2 - e_t | e_o - t_2; e_o - t_2]
            n_w = 2
            τ_0 = sqrt(τ_2(0)^2 + τ_10^2)
        #else if vorm ≡ 5
            y_3 = b_m/2 - t_1
            z_3 = h_m/2 - t_2
            e_f = (h_m - t_2)/2
            e_w = (b_m - t_1)/2
            a_f(y) = abs(y)*e_f
            τ_lf(z) = τ_2(z) + abs(V_1)*abs(z)*e_w/I_2
            F_l = [-y_3; -y_3; -y_3; -y_3 | y_3; y_3; y_3; y_3 | -e_t; t_2 - e_t; e_o - t_2; e_o]
            n_f = 4
            W_l = [-b_m/2; -y_3; y_3; b_m/2 | -z_3; -z_3; -z_3; -z_3 | z_3; z_3; z_3; z_3]
            n_w = 4
        #else if vorm ≡ 6
            y_r = t_1/2
            e_f = abs(e_t - t_2/2)
            a_f(y) = (b_m/2 - abs(y))*e_f
            τ_lf(z) = sqrt(τ_2(z)^2 + τ_10^2)
            F_l = [y_r; y_r; -y_r; -y_r | b_m/2; b_m/2; -b_m/2; -b_m/2 | -e_t; t_2 - e_t; -e_t; t_2 - e_t]
            n_f = 4
            W_l = [-t_1/2; t_1/2 | t_2 - e_t; t_2 - e_t | e_o; e_o]
            n_w = 2
            τ_0 = sqrt(τ_2(0)^2 + τ_10^2)
        #else
            y_r = t_1 - e_l
            y_t = e_r
            y_h = t_1/2 - e_l
            z_j = (h_m - t_2)/2
            z_3 = h_m/2 - t_2
            S_r = t_2*abs(y_t^2 - y_h^2)/2
            a_f(y) = (y_t - y)*z_j
            τ_lf(z) = τ_2(z) + abs(V_1)*S_r*abs(z)/(z_j*I_2*t_1)
            F_l = [y_r; y_r; y_r; y_r | y_t; y_t; y_t; y_t | -e_t; t_2 - e_t; e_o - t_2; e_o]
            n_f = 4
            W_l = [-e_l; y_r | -z_3; -z_3 | z_3; z_3]
            n_w = 2
        #end if
        #for l = 1 : n_f
            #for i = 0 : 24
                y_i = F_l.(1; l) + i/24*(F_l.(2; l) - F_l.(1; l))
                z_i = F_l.(3; l)
                τ_i = abs(V_2)*a_f(y_i)/I_1 + τ_1(y_i)
                s_i = σ_p(y_i; z_i)
                v_i = sqrt(s_i^2 + 3*τ_i^2)
                #if v_i > v_f
                    v_f = v_i
                    y_f = y_i
                    z_f = z_i
                    s_f = s_i
                    τ_f = τ_i
                #end if
            #loop
        #loop
        #for l = 1 : n_w
            #for i = 0 : 24
                y_i = W_l.(1; l)
                z_i = W_l.(2; l) + i/24*(W_l.(3; l) - W_l.(2; l))
                τ_i = τ_lf(z_i)
                s_i = σ_p(y_i; z_i)
                v_i = sqrt(s_i^2 + 3*τ_i^2)
                #if v_i > v_w
                    v_w = v_i
                    y_w = y_i
                    z_w = z_i
                    s_w = s_i
                    τ_w = τ_i
                #end if
            #loop
        #loop
    #else if vorm ≡ 2
        τ_0 = sqrt(τ_2(0)^2 + τ_1(0)^2)
        #for i = 0 : 24
            y_i = -e_l + i/24*b_m
            τ_yi = τ_1(y_i)
            #for j = 0 : 24
                z_i = -e_t + j/24*h_m
                τ_i = sqrt(τ_2(z_i)^2 + τ_yi^2)
                s_i = σ_p(y_i; z_i)
                v_i = sqrt(s_i^2 + 3*τ_i^2)
                #if v_i > v_w
                    v_w = v_i
                    y_w = y_i
                    z_w = z_i
                    s_w = s_i
                    τ_w = τ_i
                #end if
            #loop
        #loop
    #else if vorm ≡ 3
        V_r = sqrt(V_1^2 + V_2^2)
        τ_c(u; w) = if(R_m^2 - w^2 > 0.000001; 4/3*V_r/A_m*(1 - w^2/R_m^2)*sqrt(1 + (u*w)^2/(R_m^2 - w^2)^2); 0)
        w_p(y; z) = if(V_r > 0; (y*V_1 + z*V_2)/V_r; 0)
        u_p(y; z) = if(V_r > 0; (y*V_2 - z*V_1)/V_r; y)
        τ_p(y; z) = τ_c(u_p(y; z); w_p(y; z))
        τ_x = τ_p(y_x; z_x)
        τ_n = τ_p(y_n; z_n)
        τ_0 = τ_p(0; 0)
        #for i = 0 : 12
            #for j = 0 : 47
                y_i = R_m*i/12*cos(2*π*j/48)
                z_i = R_m*i/12*sin(2*π*j/48)
                τ_i = τ_p(y_i; z_i)
                s_i = σ_p(y_i; z_i)
                v_i = sqrt(s_i^2 + 3*τ_i^2)
                #if v_i > v_w
                    v_w = v_i
                    y_w = y_i
                    z_w = z_i
                    s_w = s_i
                    τ_w = τ_i
                #end if
            #loop
        #loop
    #else
        t_m = t/(1 mm)
        τ_p(y; z) = S_ym.1/(I_1*2*t_m)*abs(y*V_2 - z*V_1)/R_m
        τ_x = τ_p(y_x; z_x)
        τ_n = τ_p(y_n; z_n)
        #for j = 0 : 143
            y_i = R_m*cos(2*π*j/144)
            z_i = R_m*sin(2*π*j/144)
            τ_i = τ_p(y_i; z_i)
            s_i = σ_p(y_i; z_i)
            v_i = sqrt(s_i^2 + 3*τ_i^2)
            #if v_i > v_w
                v_w = v_i
                y_w = y_i
                z_w = z_i
                s_w = s_i
                τ_w = τ_i
            #end if
        #loop
    #end if
    v_x = sqrt((σ_max/(1 N/mm^2))^2 + 3*τ_x^2)
    v_n = sqrt((σ_min/(1 N/mm^2))^2 + 3*τ_n^2)
    v_0 = sqrt(s_0^2 + 3*τ_0^2)
    v_m = max(v_x; v_n; v_f; v_w; v_0)
    y_vb = if(v_x ≡ v_m; y_x; if(v_n ≡ v_m; y_n; if(v_f ≡ v_m; y_f; if(v_w ≡ v_m; y_w; 0))))
    z_vb = if(v_x ≡ v_m; z_x; if(v_n ≡ v_m; z_n; if(v_f ≡ v_m; z_f; if(v_w ≡ v_m; z_w; 0))))
    σ_v,max = v_m*(1 N/mm^2)
    y_v = y_vb*mm
    z_v = z_vb*mm
    #show
    'σ<sub>v</sub> = √(σ² + 3·τ²), op de plekken uit de tabel. Elke rij is de hoogste waarde van die groep.
    '<table style="width:100%; border-collapse:collapse; font-size:0.9em; line-height:1.15;">
    '<tr style="border-bottom:2px solid #374151;"><th style="text-align:left; padding:2px 8px;">Plek</th><th style="text-align:right; padding:2px 8px;">y (mm)</th><th style="text-align:right; padding:2px 8px;">z (mm)</th><th style="text-align:right; padding:2px 8px;">σ (N/mm²)</th><th style="text-align:right; padding:2px 8px;">τ (N/mm²)</th><th style="text-align:right; padding:2px 8px;">σ<sub>v</sub> (N/mm²)</th></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Uiterste vezel, σ<sub>max</sub></td><td style="padding:1px 8px; text-align:right;">'round(y_x; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(z_x; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(σ_max/(1 N/mm^2); 1)'</td><td style="padding:1px 8px; text-align:right;">'round(τ_x; 1)'</td><td style="padding:1px 8px; text-align:right; font-weight:700;">'round(v_x; 1)'</td></tr>
    '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Uiterste vezel, σ<sub>min</sub></td><td style="padding:1px 8px; text-align:right;">'round(y_n; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(z_n; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(σ_min/(1 N/mm^2); 1)'</td><td style="padding:1px 8px; text-align:right;">'round(τ_n; 1)'</td><td style="padding:1px 8px; text-align:right; font-weight:700;">'round(v_n; 1)'</td></tr>
    #if wand ≡ 1
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Flens, hoogste σ<sub>v</sub></td><td style="padding:1px 8px; text-align:right;">'round(y_f; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(z_f; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(s_f; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(τ_f; 1)'</td><td style="padding:1px 8px; text-align:right; font-weight:700;">'round(v_f; 1)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Lijf, hoogste σ<sub>v</sub></td><td style="padding:1px 8px; text-align:right;">'round(y_w; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(z_w; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(s_w; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(τ_w; 1)'</td><td style="padding:1px 8px; text-align:right; font-weight:700;">'round(v_w; 1)'</td></tr>
    #else if vorm ≡ 4
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Wand, hoogste σ<sub>v</sub></td><td style="padding:1px 8px; text-align:right;">'round(y_w; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(z_w; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(s_w; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(τ_w; 1)'</td><td style="padding:1px 8px; text-align:right; font-weight:700;">'round(v_w; 1)'</td></tr>
    #else
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Binnen de doorsnede, hoogste σ<sub>v</sub></td><td style="padding:1px 8px; text-align:right;">'round(y_w; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(z_w; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(s_w; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(τ_w; 1)'</td><td style="padding:1px 8px; text-align:right; font-weight:700;">'round(v_w; 1)'</td></tr>
    #end if
    #if bool(vorm ≤ 3) + bool(vorm ≡ 6) ≡ 1
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Zwaartepunt</td><td style="padding:1px 8px; text-align:right;">0</td><td style="padding:1px 8px; text-align:right;">0</td><td style="padding:1px 8px; text-align:right;">'round(s_0; 1)'</td><td style="padding:1px 8px; text-align:right;">'round(τ_0; 1)'</td><td style="padding:1px 8px; text-align:right; font-weight:700;">'round(v_0; 1)'</td></tr>
    #end if
    '</table>
    σ_v,max', hoogste<span class="kolom-3"></span>'
    y_v', plaats<span class="kolom-3"></span>'
    z_v', plaats<span class="kolom-3"></span>'
    #if wand ≡ 1
        '<i>In de flens loopt de schuifstroom uit de dwarskracht evenwijdig aan de flens en telt hij op: daarom staat er een andere τ dan in het diagram langs de as. In het lijf telt de koorde.</i><span class="alleen-scherm"></span>
    #end if

    #if f_y > 0 N/mm^2
        #hide
        UC_h = σ_v,max/f_y
        #show
        #if UC_h > 1
            UC_max = ru(UC_h)'<span class="alleen-scherm"></span>'
            UC_max'<span class="alleen-afdruk"></span>'
            '<span class="alleen-scherm"><b>Maatgevende UC = 'UC_max'</b></span><span class="oordeel" style="color: red"> > 1.0 → <b>Spanning voldoet niet aan de grenswaarde</b></span>
        #else
            UC_max = ru(UC_h)'<span class="alleen-scherm"></span>'
            UC_max'<span class="alleen-afdruk"></span>'
            '<span class="alleen-scherm"><b>Maatgevende UC = 'UC_max'</b></span><span class="oordeel" style="color: green"> ≤ 1.0 → <b>Spanning voldoet aan de grenswaarde</b></span>
        #end if
    #else
        '<i class="ook-afdruk">Geen grenswaarde ingevuld: dit blad geeft de spanningen en geen oordeel.</i>
    #end if
    '<i class="ook-afdruk">Lineair-elastisch en ongescheurd; vlakke doorsneden blijven vlak. Wringing en lokale effecten, zoals plooi, gaten en krachtsinleiding, zitten er niet in.</i>
    #if vorm ≥ 6
        '<i class="ook-afdruk">De dwarskracht gaat door het dwarskrachtencentrum: daarbuiten wringt de doorsnede, en die wringing zit niet in dit blad.</i>
    #end if
    #if vorm ≥ 5
        '<i class="ook-afdruk">Scherpe hoeken: zonder afrondingen.</i>
    #end if
#else
    # 2. Invoercontrole
    #if ok_m ≡ 0
        #if vorm ≡ 1
            '<span style="color:#b91c1c">Ongeldig: h, b, t<sub>w</sub> en t<sub>f</sub> moeten groter zijn dan 0, de flenzen mogen elkaar niet raken en het lijf moet smaller zijn dan de flens. De afronding mag niet negatief zijn en moet tussen lijf en flensrand en tussen de flenzen passen.</span>
        #else if vorm ≡ 2
            '<span style="color:#b91c1c">Ongeldig: de breedte en de hoogte moeten groter zijn dan 0.</span>
        #else if vorm ≡ 3
            '<span style="color:#b91c1c">Ongeldig: de diameter moet groter zijn dan 0.</span>
        #else if vorm ≡ 4
            '<span style="color:#b91c1c">Ongeldig: de diameter en de wanddikte moeten groter zijn dan 0 en de wanddikte moet kleiner zijn dan de straal.</span>
        #else if vorm ≡ 5
            '<span style="color:#b91c1c">Ongeldig: de maten moeten groter zijn dan 0 en de wanden mogen elkaar niet raken.</span>
        #else if vorm ≡ 6
            '<span style="color:#b91c1c">Ongeldig: de maten moeten groter zijn dan 0, het lijf smaller dan de flens en de flens lager dan de doorsnede.</span>
        #else
            '<span style="color:#b91c1c">Ongeldig: de maten moeten groter zijn dan 0, de rug smaller dan de doorsnede, en de flenzen mogen elkaar niet raken.</span>
        #end if
    #end if
    #if ok_g ≡ 0
        '<span style="color:#b91c1c">Ongeldig: de grenswaarde mag niet negatief zijn.</span>
    #end if
    '<span class="oordeel" style="color:#b91c1c"><b>Eindoordeel: ongeldige invoer, niet getoetst</b></span>
#end if
`;
