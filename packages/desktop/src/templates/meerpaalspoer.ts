/**
 * Poer op drie of vier palen — gewapendbetonnen poer met een ruimtelijk staafwerkmodel
 * volgens NEN-EN 1992-1-1:2005+A1:2015 en NB:2016+A1:2020 (6.5, 9.8.1).
 *
 * Toepassingsgebied, toetsset en de stand van de normcontrole staan in
 * docs/meerpaalspoer-toetsing.md, de handberekeningen in scripts/check-meerpaalspoer.mjs.
 * Opzet en regels volgen de tweepaalspoer (templates/tweepaalspoer.ts): vier toestanden
 * per toets, een onafgeronde UC_hoogst die beslist, UC_max die naar boven afrondt, en een
 * slotregel die bladLezen.leesResultaat leest.
 *
 * Vier palen staan in een rechthoek onder een rechthoekige poer; drie palen in een
 * gelijkzijdige driehoek onder een driehoekige poer met afgeschuinde hoeken. De kolom
 * staat in het zwaartepunt van de palen en draagt N, M_x en M_y; de paalreacties volgen
 * lineair uit de momenten. De belastingen zijn zonder eigen gewicht van de poer: dat telt
 * het blad erbij.
 *
 * Op papier beknopt: invoer in kolommen, per toets een regel en de samenvatting in één
 * tabel. Uitleg staat alleen op het scherm.
 */

export const meerpaalspoer = `"Poer op drie of vier palen — gewapend beton volgens EN 1992-1-1

'<i>Gewapendbetonnen poer op drie of vier palen met een kolom die een normaalkracht en momenten draagt, berekend met een ruimtelijk staafwerkmodel: drukdiagonalen van de kolom naar elke paal en trekbanden onderin, over de palen. De tekening en de toetsing gebruiken dezelfde invoer en dezelfde gekozen staven.</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "voldoet"; "voldoet niet")
'Naar boven afgerond: 1,004 staat er als 1,01 en nooit als 1,00.
ru(u) = ceil(u*100)/100
#show

# 1. Invoer

'<h6>Poer, palen en kolom</h6>
@select n_p "Aantal palen"
  Vier palen in een rechthoek = 4
  Drie palen in een gelijkzijdige driehoek = 3
@end
#if n_p ≡ 4
    a_x = ?{1000}*(mm)', hart-op-hart palen in x<span class="kolom-3"></span>'
    a_y = ?{1000}*(mm)', hart-op-hart palen in y<span class="kolom-3"></span>'
    l_poer = ?{1700}*(mm)', lengte poer, in x<span class="kolom-3"></span>'
    b_poer = ?{1700}*(mm)', breedte poer, in y<span class="kolom-3"></span>'
    #hide
    a_3 = 1200 mm
    r_rand = 400 mm
    #show
#else
    a_3 = ?{1200}*(mm)', hart-op-hart palen<span class="alleen-scherm">, de zijde van de driehoek</span><span class="kolom-3"></span>'
    r_rand = ?{400}*(mm)', paalhart tot de rand<span class="alleen-scherm">, loodrecht op de rand en op de afgeschuinde hoek</span><span class="kolom-3"></span>'
    #hide
    a_x = a_3
    a_y = a_3
    l_poer = 1900 mm
    b_poer = 1900 mm
    #show
#end if
h_poer = ?{900}*(mm)', hoogte poer<span class="kolom-3"></span>'
e_p = ?{50}*(mm)', afwijking paal in het werk<span class="alleen-scherm"> (9.8.1(1)); bijvoorbeeld de tolerantie uit het bestek. Bij 0 geeft dit blad geen eindoordeel</span><span class="kolom-3"></span>'
t_in = ?{50}*(mm)', inbedding paalkop<span class="alleen-scherm"> in de poer (figuur 9.11)</span><span class="kolom-3"></span>'

@select paalvorm "Paal"
  Vierkant of rechthoekig = 1
  Rond = 2
@end
#if paalvorm ≡ 2
    p_x = ?{320}*(mm)', paaldiameter<span class="kolom-3"></span>'
    #hide
    p_y = p_x
    #show
#else
    p_x = ?{320}*(mm)', paalmaat in x<span class="kolom-3"></span>'
    p_y = ?{320}*(mm)', paalmaat in y<span class="kolom-3"></span>'
#end if

@select kolomvorm "Kolom"
  Rechthoekig = 1
  Rond = 2
@end
#if kolomvorm ≡ 2
    c_x = ?{400}*(mm)', kolomdiameter<span class="kolom-3"></span>'
    #hide
    c_y = c_x
    #show
#else
    c_x = ?{400}*(mm)', kolommaat in x<span class="kolom-3"></span>'
    c_y = ?{400}*(mm)', kolommaat in y<span class="kolom-3"></span>'
#end if

'<h6>Beton, betonstaal en dekking</h6>
@select betonklasse "Betonsterkteklasse"
  C30/37 = 30
  C20/25 = 20
  C25/30 = 25
  C35/45 = 35
  C40/50 = 40
  C45/55 = 45
  C50/60 = 50
@end
@select betonstaal "Betonstaal"
  B500B = 2
  B500C = 3
  B500A = 1
@end
@select milieu "Milieuklasse"
  XC2/XC3 = 2
  XC1 = 1
  XC4 = 3
  XD1/XS1 = 4
  XD2/XS2 = 5
  XD3/XS3 = 6
@end
@select ondergrond "Gestort op"
  Werkvloer, zijkanten in bekisting = 1
  Direct op en tegen de grond = 2
@end
d_g = ?{16}*(mm)', grootste korrel<span class="kolom-3"></span>'
c_o = ?{75}*(mm)', onderkant poer tot onderkant trekband<span class="kolom-3"></span>'
c_z = ?{40}*(mm)', dekking op zij en boven<span class="kolom-3"></span>'

'<h6>Trekbanden onderin, over de palen</h6>
n_t = ?{5}', staven per band<span class="alleen-scherm">; elke band dezelfde staven</span><span class="kolom-3"></span>'
d_t = ?{20}*(mm)', staafdiameter<span class="kolom-3"></span>'
s_t = ?{80}*(mm)', hart-op-hart in de band<span class="kolom-3"></span>'
@select vorm_t "Staafvorm"
  Omgebogen einden, been naar boven = 2
  Rechte staaf = 1
@end
#if vorm_t ≡ 2
    l_op = ?{500}*(mm)', lengte opgebogen been<span class="alleen-scherm">, hart staaf tot uiteinde</span><span class="kolom-3"></span>'
    D_m = ?{200}*(mm)', doorndiameter<span class="kolom-3"></span>'
#else
    #hide
    l_op = 0 mm
    D_m = 0 mm
    #show
#end if
'<i>Bij vier palen ligt de band in x onderin en de band in y erop. Bij drie palen ligt de band tussen de twee onderste palen onderin; de twee schuine banden kruisen elkaar boven de bovenste paal, dus de linker ligt erop en de rechter nog een laag hoger. De hefboomsarm rekent met de bovenste laag.</i><span class="alleen-scherm"></span>

'<h6>Ondernet en randbeugels</h6>
d_n = ?{12}*(mm)', ondernet, diameter<span class="alleen-scherm">; 0 = geen net</span><span class="kolom-3"></span>'
s_n = ?{150}*(mm)', ondernet, hart-op-hart<span class="kolom-3"></span>'
n_z = ?{3}', randbeugels over de hoogte<span class="alleen-scherm">, liggende beugels langs de zijvlakken; 0 = geen</span><span class="kolom-3"></span>'
d_z = ?{12}*(mm)', randbeugel, diameter<span class="kolom-3"></span>'

'<h6>Belastingen op de poer, zonder eigen gewicht van de poer</h6>
N_Ed = ?{2000}*(kN)', kolomlast UGT<span class="alleen-scherm">, de maatgevende combinatie 6.10a of 6.10b</span><span class="kolom-3"></span>'
M_Edx = ?{0}*(kN*m)', moment om de x-as, UGT<span class="kolom-3"></span>'
M_Edy = ?{0}*(kN*m)', moment om de y-as, UGT<span class="kolom-3"></span>'
N_fr = ?{1450}*(kN)', kolomlast BGT, frequent<span class="alleen-scherm"> (tabel 7.1N van de NB)</span><span class="kolom-3"></span>'
M_frx = ?{0}*(kN*m)', moment om de x-as, frequent<span class="kolom-3"></span>'
M_fry = ?{0}*(kN*m)', moment om de y-as, frequent<span class="kolom-3"></span>'
@select horiz "Horizontale krachten op de palen"
  Niet aangetoond = 0
  Opgenomen buiten dit blad = 1
@end
'<i>De momenten gaan via de paalreacties; een horizontale kracht in de kolomvoet niet. Die moet ergens anders zijn opgenomen, door de palen of door funderingsbalken. Zonder die bevestiging geeft dit blad geen eindoordeel.</i><span class="alleen-scherm"></span>

#hide
vier = bool(n_p ≡ 4)
ok_maten = bool(h_poer > 0 mm)*bool(p_x > 0 mm)*bool(p_y > 0 mm)*bool(c_x > 0 mm)*bool(c_y > 0 mm)*bool(c_o > 0 mm)*bool(c_z > 0 mm)*bool(d_g > 0 mm)*bool(e_p ≥ 0 mm)*bool(t_in ≥ 0 mm)*if(vier ≡ 1; bool(a_x > 0 mm)*bool(a_y > 0 mm)*bool(l_poer > 0 mm)*bool(b_poer > 0 mm); bool(a_3 > 0 mm)*bool(r_rand > 0 mm))
ok_staven = bool(n_t ≥ 1)*bool(n_t ≡ round(n_t))*bool(d_t > 0 mm)*bool(s_t > 0 mm)*bool(n_z ≥ 0)*bool(n_z ≡ round(n_z))*bool(d_n ≥ 0 mm)*bool(d_z ≥ 0 mm)*(1 - bool(n_z > 0)*bool(d_z ≤ 0 mm))*(1 - bool(d_n > 0 mm)*bool(s_n ≤ 0 mm))
ok_vorm = 1 - bool(vorm_t ≡ 2)*(1 - bool(l_op > 0 mm)*bool(D_m > 0 mm))
ok_last = bool(N_Ed > 0 kN)*bool(N_fr > 0 kN)*bool(N_fr ≤ N_Ed)*bool(abs(M_frx) ≤ abs(M_Edx))*bool(abs(M_fry) ≤ abs(M_Edy))
ok_inpas = if(vier ≡ 1; bool(l_poer ≥ a_x + p_x)*bool(b_poer ≥ a_y + p_y)*bool(a_x > p_x)*bool(a_y > p_y)*bool(c_x ≤ l_poer)*bool(c_y ≤ b_poer); bool(r_rand > max(p_x; p_y)/2)*bool(a_3 > max(p_x; p_y)))
'Hoogten: de onderste laag (band in x, of de onderste band bij drie palen) en de lagen erop.
'Bij drie palen kruisen de schuine banden boven de bovenste paal: de rechter ligt een derde laag hoger.
s_v = max(d_t; d_g + 5 mm; 20 mm)
n_lg = if(vier ≡ 1; 2; 3)
a_t1 = c_o + d_t/2
a_t2 = c_o + d_t + d_t/2
a_tt = c_o + (n_lg - 1)*d_t + d_t/2
a_tb = c_o + n_lg*d_t
d_eff = h_poer - a_tt
ok_hoogte = bool(d_eff > 0 mm)*bool(a_tb > t_in)
ok_project = bool(DesignLife > 0)*bool(CC ≥ 1)
invoer_ok = ok_maten*ok_staven*ok_vorm*ok_last*ok_inpas*ok_hoogte*ok_project
#show

#if invoer_ok ≡ 1
    #hide
    rond_p = bool(paalvorm ≡ 2)
    rond_k = bool(kolomvorm ≡ 2)
    f_ck = betonklasse*(1 N/mm^2)
    betontabel = [20; 25; 30; 35; 40; 45; 50 | 2.2; 2.6; 2.9; 3.2; 3.5; 3.8; 4.1 | 1.5; 1.8; 2.0; 2.2; 2.5; 2.7; 2.9 | 30; 31; 33; 34; 35; 36; 37]
    f_ctm = hlookup(betontabel; betonklasse; 1; 2)*(1 N/mm^2)
    f_ctk = hlookup(betontabel; betonklasse; 1; 3)*(1 N/mm^2)
    E_cm = hlookup(betontabel; betonklasse; 1; 4)*(1000 N/mm^2)
    E_s = 200000 N/mm^2
    f_yk = 500 N/mm^2
    A_t1 = π*d_t^2/4
    A_b = n_t*A_t1
    A_n1 = if(d_n > 0 mm; π*d_n^2/4; 0 mm^2)
    A_z = if(n_z > 0; π*d_z^2/4; 0 mm^2)
    p_xe = if(rond_p ≡ 1; p_x*sqrt(π)/2; p_x)
    p_ye = if(rond_p ≡ 1; p_x*sqrt(π)/2; p_y)
    c_xe = if(rond_k ≡ 1; c_x*sqrt(π)/2; c_x)
    c_ye = if(rond_k ≡ 1; c_x*sqrt(π)/2; c_y)
    A_p = p_xe*p_ye
    A_k = c_xe*c_ye
    'Het zwaartepunt van een kwart van de kolom, vanuit het hart: daar begint de diagonaal naar een paal.
    e_kx = if(rond_k ≡ 1; 2*c_x/(3*π); c_x/4)
    e_ky = if(rond_k ≡ 1; 2*c_x/(3*π); c_y/4)
    b_band = (n_t - 1)*s_t + d_t
    'Drie palen: R van het zwaartepunt tot een paal, r_in tot een zijde, L_g de zijde van de grote driehoek om de poer.
    R_3 = a_3/sqrt(3)
    r_in = a_3/(2*sqrt(3))
    L_g = 2*sqrt(3)*(r_in + r_rand)
    'De breedte van de driehoekige poer op hoogte y (y omhoog naar de bovenste paal), tussen de twee schuine randen.
    b_3(y) = 2*((R_3 - y)*tan(30*π/180) + r_rand/sin(60*π/180))
    A_c = if(vier ≡ 1; l_poer*b_poer; sqrt(3)/4*L_g^2 - sqrt(3)*r_rand^2)
    #show

    # 2. Materiaal, paalreacties en staafwerk

    f_cd = f_ck/1.5', 3.1.6 (NB)<span class="kolom-4"></span>'
    f_yd = f_yk/1.15'<span class="kolom-4"></span>'
    ν_s = 1 - f_ck/(250 N/mm^2)', ν′ (NB)<span class="kolom-4"></span>'
    ν_v = 0.6*ν_s', ν (6.6N)<span class="kolom-4"></span>'
    A_b', één band<span class="kolom-4"></span>'
    d_eff', nuttige hoogte, bovenste laag<span class="alleen-scherm">; bij drie palen de derde laag, waar de schuine banden kruisen</span><span class="kolom-4"></span>'
    A_c', grondvlak poer<span class="kolom-4"></span>'
    G_poer = 25 kN/m^3*A_c*h_poer to kN', eigen gewicht<span class="kolom-4"></span>'
    #hide
    γ_Ga = if(CC ≡ 1; 1.2; if(CC ≡ 3; 1.5; 1.35))
    'De paalafwijking telt als moment N·e_p in beide richtingen, met het ongunstige teken.
    N_tot = N_Ed + γ_Ga*G_poer
    N_frt = N_fr + G_poer
    N_kar = N_Ed/1.3 + G_poer
    M_x1 = abs(M_Edx) + N_tot*e_p
    M_y1 = abs(M_Edy) + N_tot*e_p
    M_xf = abs(M_frx) + N_frt*e_p
    M_yf = abs(M_fry) + N_frt*e_p
    M_xk = abs(M_Edx)/1.3 + N_kar*e_p
    M_yk = abs(M_Edy)/1.3 + N_kar*e_p
    'Vier palen op (±a_x/2, ±a_y/2): R = N/4 ± M_y/(2·a_x) ± M_x/(2·a_y).
    R4(N; Mx; My) = N/4 + My/(2*a_x) + Mx/(2*a_y)
    R4m(N; Mx; My) = N/4 - My/(2*a_x) - Mx/(2*a_y)
    'Drie palen: boven op (0, R), onder op (±a/2, −R/2); Σy² = 1,5·R², Σx² = a²/2.
    R3b(N; Mx; My) = N/3 + Mx/(1.5*R_3)
    R3o(N; Mx; My) = N/3 + Mx/(3*R_3) + My/a_3
    R3m(N; Mx; My) = N/3 - max(Mx/(1.5*R_3); Mx/(3*R_3) + My/a_3)
    R_bov = if(vier ≡ 1; R4(N_tot; M_x1; M_y1); R3b(N_tot; M_x1; M_y1))
    R_ond = if(vier ≡ 1; R4(N_tot; M_x1; M_y1); R3o(N_tot; M_x1; M_y1))
    #show
    N_tot', UGT met eigen gewicht<span class="kolom-4"></span>'
    R_Ed = max(R_bov; R_ond) to kN', grootste paalreactie<span class="alleen-scherm">, door te geven aan de toetsing van de paal; met de momenten en de paalafwijking</span><span class="alleen-scherm"></span>'
    R_Ed', grootste paalreactie<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    R_min = if(vier ≡ 1; R4m(N_tot; M_x1; M_y1); R3m(N_tot; M_x1; M_y1)) to kN', kleinste paalreactie<span class="alleen-scherm">, moet druk zijn</span><span class="alleen-scherm"></span>'
    R_min', kleinste paalreactie<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    #hide
    'De horizontale arm van de diagonaal: van het kwartpunt van de kolom tot het paalhart, de paal naar buiten verschoven.
    d_x = a_x/2 + e_p - e_kx
    d_y = a_y/2 + e_p - e_ky
    r_3 = R_3 + e_p - min(e_kx; e_ky)
    r_h = if(vier ≡ 1; sqrt(d_x^2 + d_y^2); r_3)
    #show
    r_h', horizontale arm diagonaal<span class="kolom-4"></span>'
    σ_ccc = 1.0*ν_s*f_cd', (6.60)<span class="alleen-scherm">, k<sub>1</sub>·ν′·f<sub>cd</sub></span><span class="alleen-scherm"></span>'
    σ_ccc', (6.60)<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    #hide
    'De drukzone onder de kolom, per richting: het moment van de palen aan één kant over de kolombreedte
    'dwars daarop, zoals bij de tweepaalspoer. Drie palen: de bovenste paal tegen de twee onderste, de grootste.
    M_tx = 2*R_Ed*d_x
    M_ty = 2*R_Ed*d_y
    M_t3 = max(R_bov; R_ond)*r_3
    ξ_x = if(vier ≡ 1; max(2*M_tx/(c_ye*σ_ccc*d_eff^2); 2*M_ty/(c_xe*σ_ccc*d_eff^2)); 2*M_t3/(min(c_xe; c_ye)*σ_ccc*d_eff^2))
    x_m = d_eff*(1 - sqrt(max(1 - ξ_x; 0)))
    z_k = min(d_eff - x_m/2; 0.9*d_eff)
    #show
    z_u = min(z_k; r_h*tan(55*π/180))', hefboomsarm UGT<span class="alleen-scherm">, uit de drukzone onder de kolom, ten hoogste 0,9·d en de arm bij θ = 55°</span><span class="alleen-scherm"></span>'
    z_u', hefboomsarm UGT<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    x_c = 2*(d_eff - z_k)', drukzone<span class="alleen-scherm"></span>'
    x_c', drukzone<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    #hide
    θ = atan(z_u/r_h)
    #show
    θ_g = θ*180/π', hoek diagonaal, graden<span class="kolom-4"></span>'
    #hide
    'Vier palen: de diagonaal R·r/z ontbonden in x en y; die componenten dragen de banden langs de zijden.
    T_x = R_Ed*d_x/z_u to kN
    T_y = R_Ed*d_y/z_u to kN
    'Drie palen: H = R·r/z naar buiten, in de knoop opgenomen door de twee banden onder 60°: elk H/√3.
    H_b = R_bov*r_3/z_u
    H_o = R_ond*r_3/z_u
    T_s = max(H_b; H_o)/sqrt(3) to kN
    T_o = H_o/sqrt(3) to kN
    T_Ed = if(vier ≡ 1; max(T_x; T_y); max(T_s; T_o))
    #show
    #if n_p ≡ 4
        T_x', band in x<span class="alleen-scherm">, R·d<sub>x</sub>/z</span><span class="kolom-2"></span>'
        T_y', band in y<span class="alleen-scherm">, R·d<sub>y</sub>/z</span><span class="kolom-2"></span>'
    #else
        T_s', schuine band<span class="alleen-scherm">, H/√3 aan elk uiteinde, de grootste</span><span class="kolom-2"></span>'
        T_o', onderste band<span class="kolom-2"></span>'
    #end if
    F_c = R_Ed/sin(θ) to kN', drukdiagonaal<span class="kolom-2"></span>'

    #hide
    a_vx = a_x/2 - p_x/2 - c_x/2 - e_p
    a_vy = a_y/2 - p_y/2 - c_y/2 - e_p
    a_v3 = R_3 - max(p_x; p_y)/2 - max(c_x; c_y)/2 - e_p
    sc_av = if(vier ≡ 1; bool(a_vx > 0 mm)*bool(a_vy > 0 mm); bool(a_v3 > 0 mm))
    sc_θ = bool(θ_g ≥ 45)
    sc_staal = bool(betonstaal ≠ 1)
    sc_d = bool(d_t ≤ 32 mm)*bool(d_n ≤ 32 mm)*bool(d_z ≤ 32 mm)
    sc_trek = bool(R_min ≥ 0 kN)
    scope_ok = sc_av*sc_θ*sc_staal*sc_d*sc_trek
    #show

    #if scope_ok ≡ 1
        # 3. UGT: trekbanden, knopen, dwarskracht en pons

        T_Rd = A_b*f_yd to kN', 6.5.3<span class="kolom-2"></span>'
        UC_T = T_Ed/T_Rd'<span class="kolom-2"></span>'
        #hide
        'Per richting over de volle breedte: de twee banden en het ondernet ertussen. A_s,min is de kleinste van
        'M_E,min = f_ctm·W en 1,25 maal de benodigde wapening (9.2.1.1 van de NB); A_s,max = 0,04·A_c.
        A_netx = if(d_n > 0 mm; A_n1*max(b_poer - 2*b_band; 0 mm)/s_n; 0 mm^2)
        A_nety = if(d_n > 0 mm; A_n1*max(l_poer - 2*b_band; 0 mm)/s_n; 0 mm^2)
        A_v4x = 2*A_b + A_netx
        A_v4y = 2*A_b + A_nety
        A_m4x = min(f_ctm*b_poer*h_poer^2/6/(0.9*d_eff*f_yd); 1.25*2*T_x/f_yd)
        A_m4y = min(f_ctm*l_poer*h_poer^2/6/(0.9*d_eff*f_yd); 1.25*2*T_y/f_yd)
        'Drie palen: een doorsnede door het zwaartepunt snijdt twee banden; de breedte daar is b_3(0).
        'Het net telt met de staven die er werkelijk door de doorsnede gaan: h.o.h. s_n tussen de schuine randen, binnen de dekking en bij een omgebogen band binnen het been.
        δ_e = c_z + if(vorm_t ≡ 2; if(n_z > 0; d_z; 0 mm) + d_t; 0 mm)
        n_3(b) = floor(max(b - 2*δ_e/cos(30*π/180); 0 mm)/s_n)
        b_30 = b_3(0 mm)
        A_v3 = 2*A_b + if(d_n > 0 mm; A_n1*n_3(b_30); 0 mm^2)
        A_m3 = min(f_ctm*b_30*h_poer^2/6/(0.9*d_eff*f_yd); 1.25*2*T_Ed/f_yd)
        UC_A4 = max(A_m4x/A_v4x; A_m4y/A_v4y; A_v4x/(0.04*b_poer*h_poer); A_v4y/(0.04*l_poer*h_poer))
        UC_A3 = max(A_m3/A_v3; A_v3/(0.04*b_30*h_poer))
        #show
        UC_A = if(vier ≡ 1; UC_A4; UC_A3)', A<sub>s,min</sub> en A<sub>s,max</sub> per richting, 9.2.1.1 (NB)<span class="alleen-scherm">: de banden en het ondernet over de volle breedte</span><span class="alleen-scherm"></span>'
        #hide
        σ_ctt = 0.75*ν_s*f_cd
        'Het vlak van de diagonaal bij de kolom: het deel van de kolom per paal, schuin gezien, plus de staande zijde
        'van dat deel over de hoogte van de drukzone. c_q is de breedte van die zijde, dwars op de diagonaal: bij vier
        'palen (c_x + c_y)/(2√2), bij drie palen twee derde van de gemiddelde kolommaat (eigen benadering).
        c_q = if(vier ≡ 1; (c_xe + c_ye)/(2*sqrt(2)); (c_xe + c_ye)/3)
        A_A = A_k/n_p*sin(θ) + c_q*x_c*cos(θ)
        'Bij de paal: de paal schuin gezien, plus de hoogte van de trekbanden boven de paalkop (u = 2·(a_t − t_in)).
        u_b = 2*max(c_o + d_t - t_in; 0 mm)
        A_B = A_p*sin(θ) + sqrt(A_p)*u_b*cos(θ)
        #show
        σ_0 = N_Ed/A_k to N/mm^2', onder de kolom<span class="kolom-4"></span>'
        σ_A = F_c/A_A to N/mm^2', kolomknoop, diagonaal<span class="alleen-scherm">, het deel van de kolom per paal en de drukzone</span><span class="alleen-scherm"></span>'
        σ_A', kolomknoop, diagonaal<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        UC_ccc = max(σ_0/σ_ccc; σ_A/σ_ccc; ξ_x)', knoop CCC<span class="alleen-scherm"></span>'
        σ_1 = R_Ed/A_p to N/mm^2', op de paal<span class="kolom-4"></span>'
        σ_B = F_c/A_B to N/mm^2', paalknoop, diagonaal<span class="kolom-4"></span>'
        σ_ctt', (6.62)<span class="alleen-scherm">, k<sub>3</sub>·ν′·f<sub>cd</sub>: boven de paal komen twee banden samen</span><span class="kolom-4"></span>'
        UC_ctt = max(σ_1; σ_B)/σ_ctt', knoop boven de paal (CTT)<span class="alleen-scherm"></span>'
        #hide
        'Dwarskracht over de volle breedte, op het kolomvlak: per richting de palen aan één kant.
        V_rd(b) = 0.5*b*d_eff*ν_v*f_cd
        k_v = min(1 + sqrt((200 mm)/d_eff); 2)
        v_min = 0.035*k_v^1.5*sqrt(f_ck/(1 N/mm^2))*(1 N/mm^2)
        v_rc(ρ) = max(0.18/1.5*k_v*(100*min(ρ; 0.02)*f_ck/(1 N/mm^2))^(1/3)*(1 N/mm^2); v_min)
        β_v(a) = min(max(a; 0.5*d_eff)/(2*d_eff); 1)
        b_3b = b_3(c_ye/2)
        b_3o = b_3(-c_ye/2)
        A_net3b = if(d_n > 0 mm; A_n1*n_3(b_3b); 0 mm^2)
        A_net3o = if(d_n > 0 mm; A_n1*n_3(b_3o); 0 mm^2)
        a_v3o = R_3/2 - max(p_x; p_y)/2 - max(c_x; c_y)/2 + e_p
        UC_V4 = max(2*R_Ed/V_rd(b_poer); 2*R_Ed/V_rd(l_poer))
        UC_V3 = max(R_bov/V_rd(b_3b); 2*R_ond/V_rd(b_3o))
        UC_c4 = max(β_v(a_vx + 2*e_p)*2*R_Ed/(v_rc((2*A_b + A_netx)/(b_poer*d_eff))*b_poer*d_eff); β_v(a_vy + 2*e_p)*2*R_Ed/(v_rc((2*A_b + A_nety)/(l_poer*d_eff))*l_poer*d_eff))
        UC_c3 = max(β_v(a_v3 + 2*e_p)*R_bov/(v_rc(A_net3b/(b_3b*d_eff))*b_3b*d_eff); β_v(a_v3o)*2*R_ond/(v_rc(A_net3o/(b_3o*d_eff))*b_3o*d_eff))
        #show
        UC_V = if(vier ≡ 1; UC_V4; UC_V3)', dwarskracht, bovengrens (6.5)<span class="alleen-scherm">, 0,5·b·d·ν·f<sub>cd</sub> over de breedte op het kolomvlak</span><span class="alleen-scherm"></span>'
        UC_Vc = if(vier ≡ 1; UC_c4; UC_c3)', dwarskracht V<sub>Rd,c</sub> (6.2a) met β = a<sub>v</sub>/2d (6.2.2(6))<span class="alleen-scherm">; het ondernet en bij vier palen de banden in die richting tellen in ρ<sub>l</sub></span><span class="alleen-scherm"></span>'
        #hide
        u_0k = if(rond_k ≡ 1; π*c_x; 2*(c_x + c_y))
        u_0p = min(3*d_eff; p_xe + p_ye)
        v_Rd = 0.4*ν_v*f_cd
        #show
        v_k = 1.15*N_Ed/(u_0k*d_eff) to N/mm^2', langs de kolom<span class="alleen-scherm">, β = 1,15</span><span class="kolom-4"></span>'
        v_p = 1.5*R_Ed/(u_0p*d_eff) to N/mm^2', langs de paal<span class="alleen-scherm">, als hoekkolom: u<sub>0</sub> = 3d ≤ c<sub>1</sub> + c<sub>2</sub>, β = 1,5</span><span class="kolom-4"></span>'
        v_Rd', 6.4.5(3) (NB)<span class="alleen-scherm">, v<sub>Rd,max</sub> = 0,4·ν·f<sub>cd</sub></span><span class="kolom-4"></span>'
        UC_v = max(v_k; v_p)/v_Rd', pons<span class="alleen-scherm"></span>'

        # 4. Verankering van de trekbanden

        #hide
        f_ctd = f_ctk/1.5
        'Aanhechting (8.4.2, figuur 8.2) bij de hoogste band: tot h = 250 mm overal goed, tot 600 mm in de onderste 250 mm, daarboven buiten de bovenste 300 mm.
        η_1 = if(h_poer ≤ 250 mm; 1.0; if(h_poer ≤ 600 mm; if(a_tt ≤ 250 mm; 1.0; 0.7); if(h_poer - a_tt ≥ 300 mm; 1.0; 0.7)))
        f_bd = 2.25*η_1*1.0*f_ctd
        σ_sd = T_Ed/A_b
        l_rqd = d_t/4*σ_sd/f_bd
        a_v2 = s_t - d_t
        'De zijdekking van de buitenste staaf van een band: bij vier palen tot het zijvlak, bij drie tot de lange rand.
        c_1 = if(vier ≡ 1; min(b_poer/2 - a_y/2; l_poer/2 - a_x/2) - b_band/2; r_rand - b_band/2)
        c_d = if(vorm_t ≡ 2; if(n_t > 1; min(a_v2/2; c_1); c_1); if(n_t > 1; min(a_v2/2; c_1; c_o); min(c_1; c_o)))
        α_1 = if(vorm_t ≡ 2; if(c_d > 3*d_t; 0.7; 1.0); 1.0)
        α_2o = if(vorm_t ≡ 2; 1 - 0.15*(c_d - 3*d_t)/d_t; 1 - 0.15*(c_d - d_t)/d_t)
        α_2 = min(1; max(0.7; α_2o))
        l_bmin = max(0.3*l_rqd; 10*d_t; 100 mm)
        l_bd = max(α_1*α_2*l_rqd; l_bmin)
        'Vanaf de binnenkant van de paal (6.5.4(7)), de paal naar buiten verschoven. Een omgebogen band buigt op binnen de randbeugel: u_r van de dekking tot het hart van het been.
        'Bij drie palen loopt de band schuin naar de afgeschuinde hoek; de buitenste staaf van de band raakt die het eerst, en alle staven van een band zijn even lang.
        u_r = if(vorm_t ≡ 2; if(n_z > 0; d_z; 0 mm) + d_t/2; 0 mm)
        l_h4 = min(l_poer/2 - a_x/2 - c_z - u_r - (p_x/2 + e_p); b_poer/2 - a_y/2 - c_z - u_r - (p_y/2 + e_p))
        l_h3 = (r_rand - c_z - u_r - (n_t - 1)/2*s_t*sin(30*π/180))/cos(30*π/180) - max(p_x; p_y)/2 - e_p
        l_h = if(vier ≡ 1; l_h4; l_h3)
        r_m = (D_m + d_t)/2
        l_av = if(vorm_t ≡ 2; l_h + l_op - (2 - π/2)*r_m; l_h)
        n_ein = if(vorm_t ≡ 2; a_tb + l_op + c_z; 0 mm)
        #show
        f_bd', (8.2)<span class="alleen-scherm">, 2,25·η<sub>1</sub>·η<sub>2</sub>·f<sub>ctd</sub>, η<sub>1</sub> uit de hoogte van de bovenste band (8.4.2)</span><span class="kolom-4"></span>'
        l_rqd', (8.3)<span class="alleen-scherm">, l<sub>b,rqd</sub></span><span class="kolom-4"></span>'
        α_1', tabel 8.2<span class="kolom-4"></span>'
        α_2', tabel 8.2<span class="alleen-scherm">, α<sub>3</sub> = α<sub>4</sub> = α<sub>5</sub> = 1, aan de veilige kant</span><span class="kolom-4"></span>'
        l_bd', (8.4)<span class="alleen-scherm">, ten minste l<sub>b,min</sub></span><span class="kolom-4"></span>'
        l_h', recht deel<span class="alleen-scherm">, vanaf de binnenkant van de paal</span><span class="kolom-4"></span>'
        l_av', beschikbaar<span class="alleen-scherm">, langs de hartlijn</span><span class="kolom-4"></span>'
        UC_l = if(l_av > 0 mm; l_bd/l_av; 99)', verankering<span class="alleen-scherm"></span>'
        #if vorm_t ≡ 2
            #hide
            D_tab = if(d_t ≤ 16 mm; 4*d_t; 5*d_t)
            F_bt = A_t1*σ_sd*max(1 - l_h/l_bd; 0)
            a_b = if(n_t > 1; min(s_t/2; c_1 + d_t/2); c_1 + d_t/2)
            f_cdb = min(f_cd; 55/1.5*(1 N/mm^2))
            D_81 = F_bt*(1/a_b + 1/(2*d_t))/f_cdb
            l_rest = l_bd - l_h
            D_nodig = if(l_rest ≤ 5*d_t; D_tab; max(D_tab; D_81))
            UC_D = max(D_nodig/D_m; n_ein/h_poer; (5*d_t + r_m)/l_op)
            #show
            D_nodig', doorn, 8.3 (NB)<span class="alleen-scherm">, tabel 8.1Na en (8.1)</span><span class="kolom-4"></span>'
            UC_D'<span class="alleen-scherm">, doorn, been in de poerhoogte en 5Ø recht na de bocht (figuur 8.1)</span><span class="alleen-scherm"></span>'
        #else
            #hide
            UC_D = 0
            #show
        #end if

        # 5. BGT: scheurwijdte

        #hide
        α_e = E_s/E_cm
        c_w = c_o
        'Het effectieve trekgebied van een band: zijn breedte en aan elke kant 5(c + Ø/2), de invloed van een staaf (7.3.4(3)).
        b_eff = b_band + 10*(c_w + d_t/2)
        ρ_b = A_b/(b_eff*d_eff)
        x_e = d_eff*(sqrt((α_e*ρ_b)^2 + 2*α_e*ρ_b) - α_e*ρ_b)
        h_ce = min(2.5*(h_poer - d_eff); (h_poer - x_e)/3; h_poer/2)
        ρ_p = A_b/(b_eff*h_ce)
        k_2 = 1 - h_ce/(2*(h_poer - x_e))
        sr_max1 = 3.4*c_w + 0.8*k_2*0.425*d_t/ρ_p
        sr_max2 = max((50 - 0.8*f_ck/(1 N/mm^2))*d_t; 15*d_t)
        sr_ver = 1.3*(h_poer - x_e)
        sr_kort = bool(s_t ≤ 5*(c_w + d_t/2))
        s_rmax = if(sr_kort ≡ 1; min(sr_max1; sr_max2); sr_ver)
        'Hefboomsarm voor de BGT: een staafwerk dat de lineair-elastische spanningen volgt (5.6.4(2)), met de kleinste paalafstand.
        a_bgt = if(vier ≡ 1; min(a_x; a_y); a_3)
        z_el = if(a_bgt < h_poer; 0.6*a_bgt; 0.2*(a_bgt + 2*h_poer))
        z_s = min(z_u; z_el)
        R_fr = if(vier ≡ 1; R4(N_frt; M_xf; M_yf); max(R3b(N_frt; M_xf; M_yf); R3o(N_frt; M_xf; M_yf)))
        R_k = if(vier ≡ 1; R4(N_kar; M_xk; M_yk); max(R3b(N_kar; M_xk; M_yk); R3o(N_kar; M_xk; M_yk)))
        f_arm = if(vier ≡ 1; max(d_x; d_y); r_3/sqrt(3))
        T_fr = R_fr*f_arm/z_s
        T_k = R_k*f_arm/z_s
        ε_w1 = (T_fr/A_b - 0.4*f_ctm/ρ_p*(1 + α_e*ρ_p))/E_s
        ε_w = max(ε_w1; 0.6*T_fr/A_b/E_s)
        'De vereiste dekking (4.4.1.2, 4.4.1.3 van de NB): S4 bij 50 jaar, S6 bij 100 jaar, in tabel 4.4N steeds 5 mm per klasse.
        S_kl = if(DesignLife ≥ 100; 6; if(DesignLife ≥ 75; 5; 4))
        c_dur4 = if(milieu ≡ 1; 15; if(milieu ≡ 2; 25; if(milieu ≡ 3; 30; if(milieu ≡ 4; 35; 40))))
        c_dur = (c_dur4 + 5*(S_kl - 4))*(1 mm)
        Δ_g = if(d_g > 32 mm; 5 mm; 0 mm)
        c_nomb = max(d_t + Δ_g; c_dur; 10 mm) + 5 mm
        k_ond = if(ondergrond ≡ 1; c_dur + 10 mm; c_dur + 50 mm)
        c_reqo = max(c_nomb; k_ond)
        c_reqz0 = max(max(d_z; d_n) + Δ_g; c_dur; 10 mm) + 5 mm
        c_reqz = if(ondergrond ≡ 1; c_reqz0; max(c_reqz0; c_dur + 50 mm))
        w_tab = if(milieu ≡ 1; 0.40; if(milieu ≤ 3; 0.30; 0.20))*(1 mm)
        k_x = if(milieu ≡ 1; 1; min(2; max(1; c_o/c_reqo)))
        w_lim = w_tab*k_x
        #show
        z_s', arm BGT<span class="alleen-scherm">, lineair-elastisch, 5.6.4(2)</span><span class="kolom-4"></span>'
        σ_s = T_fr/A_b to N/mm^2', 7.3.1(8)<span class="alleen-scherm">, staalspanning in de zwaarste band, frequent</span><span class="alleen-scherm"></span>'
        σ_s', 7.3.1(8)<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        σ_k = T_k/A_b to N/mm^2', 7.2(4)P<span class="alleen-scherm">, staalspanning, karakteristiek, de last afgeschat als UGT/1,3</span><span class="alleen-scherm"></span>'
        σ_k', 7.2(4)P<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        s_rmax', (7.11) (NB) of (7.14)<span class="alleen-scherm">, s<sub>r,max</sub></span><span class="kolom-4"></span>'
        ε_w', (7.9)<span class="alleen-scherm">, ε<sub>sm</sub> − ε<sub>cm</sub></span><span class="kolom-4"></span>'
        w_k = s_rmax*ε_w to mm', (7.8)<span class="alleen-scherm">, scheurwijdte</span><span class="kolom-2"></span>'
        w_lim', tabel 7.1N (NB)<span class="alleen-scherm">, met k<sub>x</sub></span><span class="kolom-2"></span>'
        UC_w = max(w_k/w_lim; σ_s/f_yk; σ_k/f_yk)', scheurwijdte, en de staalspanning onder de vloeigrens<span class="alleen-scherm"></span>'
        #hide
        h_in = h_poer - a_tb - c_z
        l_zijde = if(vier ≡ 1; max(l_poer; b_poer); L_g)
        #show
        #if h_poer ≥ 1000 mm
            A_huid = 0.4*0.5*f_ctm*l_zijde*h_poer/2/f_yk', huidwapening, 7.3.3(3)<span class="alleen-scherm">, per zijvlak, langs de langste zijde</span><span class="alleen-scherm"></span>'
            A_huid', 7.3.3(3)<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
            UC_h = A_huid/max(n_z*A_z; 1 mm^2)'<span class="alleen-scherm"></span>'
        #else
            #hide
            UC_h = 0
            #show
        #end if

        '<h6>6. Detaillering</h6>

        #hide
        'Vrije ruimte tussen evenwijdige staven, 8.2(2) van de NB. Een noemer van 0 of minder is geen geldige afstand.
        vrij(s; d) = if(s > d; max(d; d_g + 5 mm; 20 mm)/(s - d); 99)
        s_zv = h_in/(n_z + 1)
        UC_sp = max(if(n_t > 1; vrij(s_t; d_t); 0); if(d_n > 0 mm; vrij(s_n; d_n); 0); if(n_z > 0; vrij(s_zv; d_z); 0))
        'De band ligt binnen de zone boven de paal (9.8.1(3), figuur 9.11), dwars op de band gemeten.
        b_zone = min(p_xe; p_ye) + 2*max(c_o + d_t/2 - t_in; 0 mm)
        UC_bd = b_band/b_zone
        UC_min = max(8 mm/d_t; if(d_n > 0 mm; 8 mm/d_n; 0); if(n_z > 0; 6 mm/d_z; 0))
        UC_kop = t_in/c_o
        o_4 = min((l_poer - a_x - p_x)/2; (b_poer - a_y - p_y)/2)
        o_3 = r_rand - max(p_x; p_y)/2
        UC_rd = (c_z + e_p)/max(if(vier ≡ 1; o_4; o_3); 1 mm)
        UC_dek = max(c_reqo/c_o; c_reqz/c_z)
        #show
        b_band', breedte band<span class="kolom-3"></span>'
        c_reqo', vereist onder, 4.4.1.3 (NB)<span class="kolom-3"></span>'
        c_reqz', vereist zij en boven<span class="kolom-3"></span>'
        UC_min'<span class="alleen-scherm">, kleinste staafdiameters, 9.8.1(3) (NB)</span><span class="alleen-scherm"></span>'
        UC_sp'<span class="alleen-scherm">, vrije ruimte tussen de staven, 8.2(2)</span><span class="alleen-scherm"></span>'
        UC_bd'<span class="alleen-scherm">, band binnen de zone boven de paal, 9.8.1(3)</span><span class="alleen-scherm"></span>'
        UC_kop'<span class="alleen-scherm">, wapening boven de paalkop</span><span class="alleen-scherm"></span>'
        UC_rd'<span class="alleen-scherm">, paal tot rand, met de afwijking, 9.8.1(1)</span><span class="alleen-scherm"></span>'
        UC_dek'<span class="alleen-scherm">, dekking</span><span class="alleen-scherm"></span>'

        #hide
        UC_hoogst = max(UC_T; UC_A; UC_ccc; UC_ctt; UC_V; UC_Vc; UC_v; UC_l; UC_D; UC_w; UC_h; UC_sp; UC_bd; UC_min; UC_kop; UC_rd; UC_dek)
        #show

        # 7. Samenvatting

        '<table style="width:100%; border-collapse:collapse; font-size:0.9em; line-height:1.15;">
        '<tr style="border-bottom:2px solid #374151;"><th style="text-align:left; padding:2px 8px;">Toets</th><th style="text-align:left; padding:2px 8px;">Artikel</th><th style="text-align:right; padding:2px 8px;">UC</th><th style="text-align:left; padding:2px 8px;">Uitkomst</th></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Trekbanden</td><td style="padding:1px 8px;">6.5.3</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_T)'">'ru(UC_T)'</td><td style="padding:1px 8px; color:'kleur(UC_T)'">'oordeel(UC_T)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">A<sub>s,min</sub> en A<sub>s,max</sub></td><td style="padding:1px 8px;">9.2.1.1</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_A)'">'ru(UC_A)'</td><td style="padding:1px 8px; color:'kleur(UC_A)'">'oordeel(UC_A)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Knoop onder de kolom (CCC)</td><td style="padding:1px 8px;">6.5.4(4)a</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_ccc)'">'ru(UC_ccc)'</td><td style="padding:1px 8px; color:'kleur(UC_ccc)'">'oordeel(UC_ccc)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Knoop boven de paal (CTT)</td><td style="padding:1px 8px;">6.5.4(4)c</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_ctt)'">'ru(UC_ctt)'</td><td style="padding:1px 8px; color:'kleur(UC_ctt)'">'oordeel(UC_ctt)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Dwarskracht, bovengrens</td><td style="padding:1px 8px;">6.2.2(6)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_V)'">'ru(UC_V)'</td><td style="padding:1px 8px; color:'kleur(UC_V)'">'oordeel(UC_V)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Dwarskracht V<sub>Rd,c</sub>, met β</td><td style="padding:1px 8px;">6.2.2(1), (6)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_Vc)'">'ru(UC_Vc)'</td><td style="padding:1px 8px; color:'kleur(UC_Vc)'">'oordeel(UC_Vc)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Pons langs kolom en paal</td><td style="padding:1px 8px;">6.4.5(3)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_v)'">'ru(UC_v)'</td><td style="padding:1px 8px; color:'kleur(UC_v)'">'oordeel(UC_v)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Verankering trekbanden</td><td style="padding:1px 8px;">8.4, 6.5.4(7)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_l)'">'ru(UC_l)'</td><td style="padding:1px 8px; color:'kleur(UC_l)'">'oordeel(UC_l)'</td></tr>
        #if vorm_t ≡ 2
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Ombuiging en been</td><td style="padding:1px 8px;">8.3</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_D)'">'ru(UC_D)'</td><td style="padding:1px 8px; color:'kleur(UC_D)'">'oordeel(UC_D)'</td></tr>
        #else
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Ombuiging en been</td><td style="padding:1px 8px;">8.3</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#64748b;">niet van toepassing<span class="alleen-scherm">, rechte staaf</span></td></tr>
        #end if
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Scheurwijdte trekbanden</td><td style="padding:1px 8px;">7.3.4 (NB)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_w)'">'ru(UC_w)'</td><td style="padding:1px 8px; color:'kleur(UC_w)'">'oordeel(UC_w)'</td></tr>
        #if h_poer ≥ 1000 mm
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Huidwapening</td><td style="padding:1px 8px;">7.3.3(3)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_h)'">'ru(UC_h)'</td><td style="padding:1px 8px; color:'kleur(UC_h)'">'oordeel(UC_h)'</td></tr>
        #else
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Huidwapening</td><td style="padding:1px 8px;">7.3.3(3)</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#64748b;">niet van toepassing<span class="alleen-scherm">, h kleiner dan 1000 mm</span></td></tr>
        #end if
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Diameters en vrije ruimte</td><td style="padding:1px 8px;">9.8.1(3), 8.2(2)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(max(UC_min; UC_sp))'">'ru(max(UC_min; UC_sp))'</td><td style="padding:1px 8px; color:'kleur(max(UC_min; UC_sp))'">'oordeel(max(UC_min; UC_sp))'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Band boven de paal</td><td style="padding:1px 8px;">9.8.1(3)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_bd)'">'ru(UC_bd)'</td><td style="padding:1px 8px; color:'kleur(UC_bd)'">'oordeel(UC_bd)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Paalkop en rand</td><td style="padding:1px 8px;">9.8.1(1)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(max(UC_kop; UC_rd))'">'ru(max(UC_kop; UC_rd))'</td><td style="padding:1px 8px; color:'kleur(max(UC_kop; UC_rd))'">'oordeel(max(UC_kop; UC_rd))'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Dekking</td><td style="padding:1px 8px;">4.4.1 (NB)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_dek)'">'ru(UC_dek)'</td><td style="padding:1px 8px; color:'kleur(UC_dek)'">'oordeel(UC_dek)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Pons op u<sub>1</sub></td><td style="padding:1px 8px;">6.4.4</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#64748b;">niet van toepassing<span class="alleen-scherm">, paal binnen 2d: via het staafwerk</span></td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Splijtkrachten in de diagonalen</td><td style="padding:1px 8px;">6.5.3(3)</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#64748b;">constructief<span class="alleen-scherm">, met het ondernet en de randbeugels; niet uitgerekend</span></td></tr>
        #if horiz ≡ 1
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Horizontale krachten</td><td style="padding:1px 8px;">—</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#64748b;">opgenomen buiten dit blad<span class="alleen-scherm">, volgens de invoer</span></td></tr>
        #else
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Horizontale krachten</td><td style="padding:1px 8px;">—</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#b45309; font-weight:700;">niet getoetst</td></tr>
        #end if
        #if e_p > 0 mm
        #else
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Paalafwijking</td><td style="padding:1px 8px;">9.8.1(1)</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#b45309; font-weight:700;">niet getoetst</td></tr>
        #end if
        '</table>

        #hide
        eind_ok = bool(UC_hoogst ≤ 1)*bool(horiz ≡ 1)*bool(e_p > 0 mm)
        #show
        #if UC_hoogst > 1
            UC_max = ru(UC_hoogst)'<span class="alleen-scherm"></span>'
            UC_max'<span class="alleen-afdruk"></span>'
            '<span class="alleen-scherm"><b>Maatgevende UC = 'UC_max'</b></span><span class="oordeel" style="color: red"> > 1.0 → <b>Poer voldoet niet</b></span>
        #else if eind_ok ≡ 1
            UC_max = ru(UC_hoogst)'<span class="alleen-scherm"></span>'
            UC_max'<span class="alleen-afdruk"></span>'
            '<span class="alleen-scherm"><b>Maatgevende UC = 'UC_max'</b></span><span class="oordeel" style="color: green"> ≤ 1.0 → <b>Poer voldoet</b></span>
        #else
            '<span class="oordeel" style="color:#b45309"><b>Eindoordeel: niet getoetst</b></span>. De hoogste UC van de overige toetsen is 'ru(UC_hoogst)'.
            #if horiz ≡ 1
            #else
                'De horizontale krachten op de palen zijn niet aangetoond.
            #end if
            #if e_p > 0 mm
            #else
                'Er is geen paalafwijking ingevoerd, terwijl 9.8.1(1) die vraagt.
            #end if
        #end if
        'Buiten dit blad: draagvermogen van de palen (R<sub>Ed</sub>), horizontale krachten, aansluiting van de kolom, brand, vermoeiing en aardbeving.

        # 8. Tekening

        #hide
        'Plattegrond: 1 mm is p_s px, het hart van de kolom in het midden van het beeld.
        p_br = if(vier ≡ 1; max(l_poer; b_poer); max(L_g; 2*(R_3 + r_rand)))
        p_s = 300/(p_br/(1 mm))
        p_X(x) = 200 + x/(1 mm)*p_s
        p_Y(y) = 175 - y/(1 mm)*p_s
        'Drie palen: hoek k op 90°, 210° en 330°; u naar buiten, v er loodrecht op (tegen de klok in).
        φ_k(k) = (90 + 120*k)*π/180
        q_x(k) = R_3*cos(φ_k(k))
        q_y(k) = R_3*sin(φ_k(k))
        t_af = r_rand*tan(30*π/180)
        h_x(k; s) = q_x(k) + r_rand*cos(φ_k(k)) + s*t_af*(-sin(φ_k(k)))
        h_y(k; s) = q_y(k) + r_rand*sin(φ_k(k)) + s*t_af*cos(φ_k(k))
        'De band van paal k naar paal k+1, doorgetrokken tot de afgeschuinde hoeken (min de dekking), zoals in de verankering.
        L_x3 = (r_rand - c_z - u_r - (n_t - 1)/2*s_t*sin(30*π/180))/cos(30*π/180)
        b_ux(k) = (q_x(mod(k + 1; 3)) - q_x(k))/a_3
        b_uy(k) = (q_y(mod(k + 1; 3)) - q_y(k))/a_3
        #show
        '<svg viewBox="0 0 400 350" width="400" height="350" style="font-family:sans-serif; font-size:10px; max-width:100%">
        #if n_p ≡ 4
            '  <rect x="'p_X(-l_poer/2)'" y="'p_Y(b_poer/2)'" width="'l_poer/(1 mm)*p_s'" height="'b_poer/(1 mm)*p_s'" style="fill:#f1f5f9; stroke:#334155; stroke-width:1.2"/>
            '  <rect x="'p_X(-l_poer/2 + c_z)'" y="'p_Y(a_y/2 + b_band/2)'" width="'(l_poer - 2*c_z)/(1 mm)*p_s'" height="'b_band/(1 mm)*p_s'" style="fill:#f59e0b; fill-opacity:0.35; stroke:#b45309; stroke-width:0.6"/>
            '  <rect x="'p_X(-l_poer/2 + c_z)'" y="'p_Y(-a_y/2 + b_band/2)'" width="'(l_poer - 2*c_z)/(1 mm)*p_s'" height="'b_band/(1 mm)*p_s'" style="fill:#f59e0b; fill-opacity:0.35; stroke:#b45309; stroke-width:0.6"/>
            '  <rect x="'p_X(a_x/2 - b_band/2)'" y="'p_Y(b_poer/2 - c_z)'" width="'b_band/(1 mm)*p_s'" height="'(b_poer - 2*c_z)/(1 mm)*p_s'" style="fill:#f59e0b; fill-opacity:0.35; stroke:#b45309; stroke-width:0.6"/>
            '  <rect x="'p_X(-a_x/2 - b_band/2)'" y="'p_Y(b_poer/2 - c_z)'" width="'b_band/(1 mm)*p_s'" height="'(b_poer - 2*c_z)/(1 mm)*p_s'" style="fill:#f59e0b; fill-opacity:0.35; stroke:#b45309; stroke-width:0.6"/>
            #for i = 0 : 1
            #for j = 0 : 1
            #if paalvorm ≡ 2
            '  <circle cx="'p_X((2*i - 1)*a_x/2)'" cy="'p_Y((2*j - 1)*a_y/2)'" r="'p_x/2/(1 mm)*p_s'" style="fill:none; stroke:#1e293b; stroke-width:1.2; stroke-dasharray:4 2"/>
            #else
            '  <rect x="'p_X((2*i - 1)*a_x/2 - p_x/2)'" y="'p_Y((2*j - 1)*a_y/2 + p_y/2)'" width="'p_x/(1 mm)*p_s'" height="'p_y/(1 mm)*p_s'" style="fill:none; stroke:#1e293b; stroke-width:1.2; stroke-dasharray:4 2"/>
            #end if
            #loop
            #loop
            '  <text x="'p_X(0)'" y="'p_Y(-b_poer/2) + 16'" text-anchor="middle" style="fill:#334155">'round(l_poer/(1 mm))' × 'round(b_poer/(1 mm))' × 'round(h_poer/(1 mm))' mm, palen 'round(a_x/(1 mm))' × 'round(a_y/(1 mm))' h.o.h.</text>
        #else
            '  <polygon points="'p_X(h_x(0; -1))','p_Y(h_y(0; -1))' 'p_X(h_x(0; 1))','p_Y(h_y(0; 1))' 'p_X(h_x(1; -1))','p_Y(h_y(1; -1))' 'p_X(h_x(1; 1))','p_Y(h_y(1; 1))' 'p_X(h_x(2; -1))','p_Y(h_y(2; -1))' 'p_X(h_x(2; 1))','p_Y(h_y(2; 1))'" style="fill:#f1f5f9; stroke:#334155; stroke-width:1.2"/>
            #for k = 0 : 2
            '  <line x1="'p_X(q_x(k) - b_ux(k)*L_x3)'" y1="'p_Y(q_y(k) - b_uy(k)*L_x3)'" x2="'p_X(q_x(mod(k + 1; 3)) + b_ux(k)*L_x3)'" y2="'p_Y(q_y(mod(k + 1; 3)) + b_uy(k)*L_x3)'" style="stroke:#f59e0b; stroke-opacity:0.45; stroke-width:'b_band/(1 mm)*p_s'"/>
            #if paalvorm ≡ 2
            '  <circle cx="'p_X(q_x(k))'" cy="'p_Y(q_y(k))'" r="'p_x/2/(1 mm)*p_s'" style="fill:none; stroke:#1e293b; stroke-width:1.2; stroke-dasharray:4 2"/>
            #else
            '  <rect x="'p_X(q_x(k) - p_x/2)'" y="'p_Y(q_y(k) + p_y/2)'" width="'p_x/(1 mm)*p_s'" height="'p_y/(1 mm)*p_s'" style="fill:none; stroke:#1e293b; stroke-width:1.2; stroke-dasharray:4 2"/>
            #end if
            #loop
            '  <text x="'p_X(0)'" y="'p_Y(-R_3/2 - r_rand) + 16'" text-anchor="middle" style="fill:#334155">driehoek 'round(a_3/(1 mm))' mm h.o.h., rand 'round(r_rand/(1 mm))' mm, h = 'round(h_poer/(1 mm))' mm</text>
        #end if
        #if kolomvorm ≡ 2
            '  <circle cx="'p_X(0)'" cy="'p_Y(0)'" r="'c_x/2/(1 mm)*p_s'" style="fill:#94a3b8; fill-opacity:0.6; stroke:#334155"/>
        #else
            '  <rect x="'p_X(-c_x/2)'" y="'p_Y(c_y/2)'" width="'c_x/(1 mm)*p_s'" height="'c_y/(1 mm)*p_s'" style="fill:#94a3b8; fill-opacity:0.6; stroke:#334155"/>
        #end if
        '  <text x="10" y="14" style="fill:#b45309">■ trekband, 'n_t' Ø'round(d_t/(1 mm))'-'round(s_t/(1 mm))' per band</text>
        '  <text x="10" y="28" style="fill:#1e293b">▭ paal, gestippeld</text>
        '</svg>
        #pre
        @3d
        eenheid mm
        camera iso
        hoogte 300
        raster uit
        assen uit
        #if n_p ≡ 4
        // de poer als omtrek, onder- en bovenvlak en de staande ribben
        #for i = 0 : 1
        buis {{-l_poer/2}} {{(2*i - 1)*b_poer/2}} 0 {{l_poer/2}} {{(2*i - 1)*b_poer/2}} 0 6 grijs
        buis {{-l_poer/2}} {{(2*i - 1)*b_poer/2}} {{h_poer}} {{l_poer/2}} {{(2*i - 1)*b_poer/2}} {{h_poer}} 6 grijs
        buis {{(2*i - 1)*l_poer/2}} {{-b_poer/2}} 0 {{(2*i - 1)*l_poer/2}} {{b_poer/2}} 0 6 grijs
        buis {{(2*i - 1)*l_poer/2}} {{-b_poer/2}} {{h_poer}} {{(2*i - 1)*l_poer/2}} {{b_poer/2}} {{h_poer}} 6 grijs
        #for j = 0 : 1
        buis {{(2*i - 1)*l_poer/2}} {{(2*j - 1)*b_poer/2}} 0 {{(2*i - 1)*l_poer/2}} {{(2*j - 1)*b_poer/2}} {{h_poer}} 6 grijs
        #if paalvorm ≡ 2
        buis {{(2*i - 1)*a_x/2}} {{(2*j - 1)*a_y/2}} {{-600 mm}} {{(2*i - 1)*a_x/2}} {{(2*j - 1)*a_y/2}} {{t_in}} {{p_x}} beton
        #else
        kolom {{(2*i - 1)*a_x/2}} {{(2*j - 1)*a_y/2}} {{-600 mm}} {{t_in}} {{p_y}} {{p_x}} beton
        #end if
        #loop
        #loop
        // de banden: in x onderin, in y erop
        #for j = 1 : n_t
        #for i = 0 : 1
        buis {{-l_poer/2 + c_z}} {{(2*i - 1)*a_y/2 + (j - (n_t + 1)/2)*s_t}} {{a_t1}} {{l_poer/2 - c_z}} {{(2*i - 1)*a_y/2 + (j - (n_t + 1)/2)*s_t}} {{a_t1}} {{d_t}} rood
        buis {{(2*i - 1)*a_x/2 + (j - (n_t + 1)/2)*s_t}} {{-b_poer/2 + c_z}} {{a_t1 + d_t}} {{(2*i - 1)*a_x/2 + (j - (n_t + 1)/2)*s_t}} {{b_poer/2 - c_z}} {{a_t1 + d_t}} {{d_t}} blauw
        #loop
        #loop
        #else
        // de poer: driehoek met afgeschuinde hoeken, onder- en bovenvlak en de staande ribben
        #for k = 0 : 2
        buis {{h_x(k; -1)}} {{h_y(k; -1)}} 0 {{h_x(k; 1)}} {{h_y(k; 1)}} 0 6 grijs
        buis {{h_x(k; 1)}} {{h_y(k; 1)}} 0 {{h_x(mod(k + 1; 3); -1)}} {{h_y(mod(k + 1; 3); -1)}} 0 6 grijs
        buis {{h_x(k; -1)}} {{h_y(k; -1)}} {{h_poer}} {{h_x(k; 1)}} {{h_y(k; 1)}} {{h_poer}} 6 grijs
        buis {{h_x(k; 1)}} {{h_y(k; 1)}} {{h_poer}} {{h_x(mod(k + 1; 3); -1)}} {{h_y(mod(k + 1; 3); -1)}} {{h_poer}} 6 grijs
        buis {{h_x(k; -1)}} {{h_y(k; -1)}} 0 {{h_x(k; -1)}} {{h_y(k; -1)}} {{h_poer}} 6 grijs
        buis {{h_x(k; 1)}} {{h_y(k; 1)}} 0 {{h_x(k; 1)}} {{h_y(k; 1)}} {{h_poer}} 6 grijs
        #if paalvorm ≡ 2
        buis {{q_x(k)}} {{q_y(k)}} {{-600 mm}} {{q_x(k)}} {{q_y(k)}} {{t_in}} {{p_x}} beton
        #else
        kolom {{q_x(k)}} {{q_y(k)}} {{-600 mm}} {{t_in}} {{p_y}} {{p_x}} beton
        #end if
        // de band van paal k naar k+1: de onderste (k = 1) onderin, de linker schuine (k = 0) erop, de rechter (k = 2) een laag hoger
        #for j = 1 : n_t
        buis {{q_x(k) - b_ux(k)*L_x3 - b_uy(k)*(j - (n_t + 1)/2)*s_t}} {{q_y(k) - b_uy(k)*L_x3 + b_ux(k)*(j - (n_t + 1)/2)*s_t}} {{a_t1 + if(k ≡ 1; 0 mm; if(k ≡ 0; d_t; 2*d_t))}} {{q_x(mod(k + 1; 3)) + b_ux(k)*L_x3 - b_uy(k)*(j - (n_t + 1)/2)*s_t}} {{q_y(mod(k + 1; 3)) + b_uy(k)*L_x3 + b_ux(k)*(j - (n_t + 1)/2)*s_t}} {{a_t1 + if(k ≡ 1; 0 mm; if(k ≡ 0; d_t; 2*d_t))}} {{d_t}} rood
        #loop
        #loop
        #end if
        // de kolom
        kolom 0 0 {{h_poer}} {{h_poer + 600 mm}} {{c_y}} {{c_x}} beton
        @end
        '<i>Het 3D-beeld: de poer als omtrek, de palen en de kolom als aanzet, de trekbanden in hun lagen. Draai het beeld met de muis.</i>
        #show
    #else
        # 3. Buiten het toepassingsgebied
        #if sc_av ≡ 0
            '<span style="color:#b45309">De kolom en een paal overlappen: er is geen staafwerk tussen die twee (a<sub>v</sub> ≤ 0, met de paalafwijking).</span>
        #end if
        #if sc_θ ≡ 0
            '<span style="color:#b45309">De drukdiagonaal is flauwer dan 45°: dit blad geldt niet voor zo een slanke poer. Maak de poer hoger of de palen dichter bij elkaar.</span>
        #end if
        #if sc_staal ≡ 0
            '<span style="color:#b45309">Betonstaal B500A: 5.6.3 raadt klasse A af voor een plastische berekening, en dat is een staafwerkmodel.</span>
        #end if
        #if sc_d ≡ 0
            '<span style="color:#b45309">Een staaf groter dan Ø32: 8.8 stelt extra eisen die dit blad niet uitwerkt.</span>
        #end if
        #if sc_trek ≡ 0
            '<span style="color:#b45309">Een paal krijgt trek: de momenten zijn te groot voor deze paalafstand. Trek in de palen en de verankering daarvan staan niet op dit blad.</span>
        #end if
        '<span class="oordeel" style="color:#b45309"><b>Eindoordeel: niet getoetst</b></span>, buiten het toepassingsgebied van dit blad.
    #end if
#else
    # 2. Invoercontrole
    #if ok_maten ≡ 0
        '<span style="color:#b91c1c">Ongeldig: elke maat van poer, paal, kolom en dekking moet groter zijn dan 0; de afwijking en de inbedding mogen 0 zijn.</span>
    #end if
    #if ok_staven ≡ 0
        '<span style="color:#b91c1c">Ongeldig: de trekband moet zijn ingevuld, met hele aantallen staven en een diameter bij elk aantal; een net vraagt een hart-op-hart.</span>
    #end if
    #if ok_vorm ≡ 0
        '<span style="color:#b91c1c">Ongeldig: omgebogen staven vragen een opgebogen been en een doorndiameter.</span>
    #end if
    #if ok_last ≡ 0
        '<span style="color:#b91c1c">Ongeldig: de kolomlasten moeten druk zijn en de BGT-lasten mogen niet groter zijn dan de UGT-lasten.</span>
    #end if
    #if ok_inpas ≡ 0
        '<span style="color:#b91c1c">Ongeldig: palen en kolom moeten binnen de poer vallen en de palen mogen elkaar niet raken.</span>
    #end if
    #if ok_project ≡ 1
    #else
        '<span style="color:#b91c1c">Ongeldig: de ontwerplevensduur of de gevolgklasse ontbreekt in de projectgegevens.</span>
    #end if
    #if ok_hoogte ≡ 0
        '<span style="color:#b91c1c">Ongeldig: de trekbanden moeten binnen de poerhoogte en boven de paalkop liggen.</span>
    #end if
    '<span class="oordeel" style="color:#b91c1c"><b>Eindoordeel: ongeldige invoer, niet getoetst</b></span>
#end if
`;
