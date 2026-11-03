/**
 * Tweepaalspoer — gewapendbetonnen poer op twee palen, met een staafwerkmodel volgens
 * NEN-EN 1992-1-1:2005+A1:2015 en NB:2016+A1:2020 (6.5, 9.8.1).
 *
 * Toepassingsgebied, toetsset en de stand van de normcontrole staan in
 * docs/tweepaalspoer-toetsing.md, de handberekeningen in
 * scripts/check-tweepaalspoer.mjs. Het beeld (TweepaalspoerDesigner.tsx) tekent uit
 * dezelfde invoer en leest de uitkomsten onafgerond uit dit blad; het rekent niet zelf.
 *
 * De uitkomst kent vier toestanden per toets: voldoet, voldoet niet, niet getoetst en
 * niet van toepassing. UC_max en de slotregel "Maatgevende UC" staan er alleen als er
 * een oordeel is; zonder oordeel staat er "Eindoordeel: niet getoetst"
 * (bladLezen.leesResultaat). De onafgeronde UC_hoogst beslist; UC_max is alleen de
 * weergave en rondt naar boven af, zodat 1,004 nooit als 1,00 in beeld komt.
 *
 * De belastingen zijn zonder eigen gewicht van de poer: dat telt het blad erbij.
 *
 * Op papier beknopt: invoer in kolommen, per toets een regel en de samenvatting in één
 * tabel. Uitleg staat alleen op het scherm.
 */

export const tweepaalspoer = `"Tweepaalspoer — gewapend beton volgens EN 1992-1-1

'<i>Gewapendbetonnen poer op twee palen met een centrische, verticale kolomlast, berekend met een staafwerkmodel. De tekening en de toetsing gebruiken dezelfde invoer en dezelfde gekozen staven.</i><span class="alleen-scherm"></span>

#hide
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
oordeel(u) = if(u ≤ 1; "voldoet"; "voldoet niet")
'Naar boven afgerond: 1,004 staat er als 1,01 en nooit als 1,00.
ru(u) = ceil(u*100)/100
#show

# 1. Invoer

'<h6>Poer, palen en kolom</h6>
l_poer = ?*(mm)', lengte poer<span class="alleen-scherm">, langs de paallijn</span><span class="kolom-3"></span>'
b_poer = ?*(mm)', breedte poer<span class="kolom-3"></span>'
h_poer = ?*(mm)', hoogte poer<span class="kolom-3"></span>'
a_hoh = ?*(mm)', hart-op-hart palen<span class="kolom-3"></span>'
e_p = ?*(mm)', afwijking paal in het werk<span class="alleen-scherm"> (9.8.1(1)); bijvoorbeeld de tolerantie uit het bestek. Bij 0 geeft dit blad geen eindoordeel</span><span class="kolom-3"></span>'
t_in = ?*(mm)', inbedding paalkop<span class="alleen-scherm"> in de poer (figuur 9.11)</span><span class="kolom-3"></span>'

@select paalvorm "Paal"
  Vierkant of rechthoekig = 1
  Rond = 2
@end
#if paalvorm ≡ 2
    p_x = ?*(mm)', paaldiameter<span class="kolom-3"></span>'
    #hide
    p_y = p_x
    #show
#else
    p_x = ?*(mm)', paalmaat in de lengterichting<span class="kolom-3"></span>'
    p_y = ?*(mm)', paalmaat in de breedterichting<span class="kolom-3"></span>'
#end if

@select kolomvorm "Kolom"
  Rechthoekig = 1
  Rond = 2
@end
#if kolomvorm ≡ 2
    c_x = ?*(mm)', kolomdiameter<span class="kolom-3"></span>'
    #hide
    c_y = c_x
    #show
#else
    c_x = ?*(mm)', kolommaat in de lengterichting<span class="kolom-3"></span>'
    c_y = ?*(mm)', kolommaat in de breedterichting<span class="kolom-3"></span>'
#end if

'<h6>Beton, betonstaal en dekking</h6>
@select betonklasse "Betonsterkteklasse"
  C20/25 = 20
  C25/30 = 25
  C30/37 = 30
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
d_g = ?*(mm)', grootste korrel<span class="kolom-3"></span>'
c_o = ?*(mm)', onderkant poer tot onderkant beugel<span class="kolom-3"></span>'
c_z = ?*(mm)', dekking op zij en boven<span class="kolom-3"></span>'

'<h6>Trekband onderin, in de lengterichting</h6>
n_t = ?', aantal staven<span class="kolom-3"></span>'
d_t = ?*(mm)', staafdiameter<span class="kolom-3"></span>'
s_t = ?*(mm)', hart-op-hart in een laag<span class="kolom-3"></span>'
@select lagen "Aantal lagen"
  Eén laag = 1
  Twee lagen = 2
@end
@select vorm_t "Staafvorm"
  Omgebogen einden, been naar boven = 2
  Rechte staaf = 1
@end
#if vorm_t ≡ 2
    l_op = ?*(mm)', lengte opgebogen been<span class="alleen-scherm">, hart staaf tot uiteinde</span><span class="kolom-3"></span>'
    D_m = ?*(mm)', doorndiameter<span class="kolom-3"></span>'
#else
    #hide
    l_op = 0 mm
    D_m = 0 mm
    #show
#end if

'<h6>Beugels, zijstaven, bovenstaven en haarspelden</h6>
d_s = ?*(mm)', beugel, diameter<span class="kolom-3"></span>'
s_s = ?*(mm)', beugel, hart-op-hart<span class="kolom-3"></span>'
n_s = ?', beugel, aantal sneden<span class="kolom-3"></span>'
n_z = ?', zijstaven per zijvlak<span class="kolom-3"></span>'
d_z = ?*(mm)', zijstaaf, diameter<span class="kolom-3"></span>'
n_b = ?', bovenstaven<span class="alleen-scherm">, constructief</span><span class="kolom-3"></span>'
d_b = ?*(mm)', bovenstaaf, diameter<span class="kolom-3"></span>'
n_hp = ?', haarspelden per paal<span class="alleen-scherm"> om de trekband; 0 = geen</span><span class="kolom-3"></span>'
d_hp = ?*(mm)', haarspeld, diameter<span class="kolom-3"></span>'

'<h6>Belastingen op de poer, zonder eigen gewicht van de poer</h6>
F_Ed = ?*(kN)', kolomlast UGT<span class="alleen-scherm">, de maatgevende combinatie 6.10a of 6.10b</span><span class="kolom-2"></span>'
F_fr = ?*(kN)', kolomlast BGT, frequent<span class="alleen-scherm"> (tabel 7.1N van de NB)</span><span class="kolom-2"></span>'
@select dwars "Dwarsstabiliteit, horizontale krachten en kolommomenten"
  Niet aangetoond = 0
  Aangetoond buiten dit blad = 1
@end
'<i>Twee palen op één lijn kunnen geen moment dwars op die lijn opnemen. Dat moet ergens anders zijn aangetoond, bijvoorbeeld met funderingsbalken. Zonder die bevestiging geeft dit blad geen eindoordeel.</i><span class="alleen-scherm"></span>

#hide
ok_maten = bool(l_poer > 0 mm)*bool(b_poer > 0 mm)*bool(h_poer > 0 mm)*bool(a_hoh > 0 mm)*bool(p_x > 0 mm)*bool(p_y > 0 mm)*bool(c_x > 0 mm)*bool(c_y > 0 mm)*bool(c_o > 0 mm)*bool(c_z > 0 mm)*bool(d_g > 0 mm)*bool(e_p ≥ 0 mm)*bool(t_in ≥ 0 mm)
ok_staven = bool(n_t ≥ 1)*bool(n_t ≡ round(n_t))*bool(d_t > 0 mm)*bool(s_t > 0 mm)*bool(d_s > 0 mm)*bool(s_s > 0 mm)*bool(n_s ≥ 2)*bool(n_s ≡ round(n_s))*bool(n_z ≥ 0)*bool(n_z ≡ round(n_z))*bool(n_b ≥ 0)*bool(n_b ≡ round(n_b))*bool(n_hp ≥ 0)*bool(n_hp ≡ round(n_hp))*bool(d_z ≥ 0 mm)*bool(d_b ≥ 0 mm)*bool(d_hp ≥ 0 mm)*(1 - bool(n_z > 0)*bool(d_z ≤ 0 mm))*(1 - bool(n_b > 0)*bool(d_b ≤ 0 mm))*(1 - bool(n_hp > 0)*bool(d_hp ≤ 0 mm))
ok_vorm = 1 - bool(vorm_t ≡ 2)*(1 - bool(l_op > 0 mm)*bool(D_m > 0 mm))
ok_last = bool(F_Ed > 0 kN)*bool(F_fr > 0 kN)*bool(F_fr ≤ F_Ed)
ok_inpas = bool(l_poer ≥ a_hoh + p_x)*bool(a_hoh > p_x)*bool(p_y ≤ b_poer)*bool(c_x ≤ l_poer)*bool(c_y ≤ b_poer)
'De hoogte waarop de wapening ligt: van onderkant poer tot het hart van de trekband.
s_v = max(d_t; d_g + 5 mm; 20 mm)
d_o = max(d_s; if(n_hp > 0; d_hp; 0 mm))
a_t = c_o + d_o + d_t/2 + (lagen - 1)*(d_t + s_v)/2
a_tb = c_o + d_o + d_t/2 + (lagen - 1)*(d_t + s_v)
d_eff = h_poer - a_t
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
    A_s = n_t*A_t1
    A_sb = π*d_s^2/4
    A_z = if(n_z > 0; π*d_z^2/4; 0 mm^2)
    A_hp = if(n_hp > 0; π*d_hp^2/4; 0 mm^2)
    p_xe = if(rond_p ≡ 1; p_x*sqrt(π)/2; p_x)
    p_ye = if(rond_p ≡ 1; p_x*sqrt(π)/2; p_y)
    c_xe = if(rond_k ≡ 1; c_x*sqrt(π)/2; c_x)
    c_ye = if(rond_k ≡ 1; c_x*sqrt(π)/2; c_y)
    A_p = p_xe*p_ye
    A_k = c_xe*c_ye
    e_k = if(rond_k ≡ 1; 2*c_x/(3*π); c_x/4)
    n_tl = ceil(n_t/lagen)
    b_band = (n_tl - 1)*s_t + d_t
    #show

    # 2. Materiaal en krachten

    f_cd = f_ck/1.5', 3.1.6 (NB)<span class="kolom-4"></span>'
    f_yd = f_yk/1.15'<span class="kolom-4"></span>'
    ν_s = 1 - f_ck/(250 N/mm^2)', ν′ (NB)<span class="kolom-4"></span>'
    ν_v = 0.6*ν_s', ν (6.6N)<span class="kolom-4"></span>'
    A_s', gekozen trekband<span class="kolom-4"></span>'
    d_eff', nuttige hoogte<span class="kolom-4"></span>'
    a_t', hart trekband<span class="kolom-4"></span>'
    a_v = a_hoh/2 - p_x/2 - c_x/2 - e_p', vrij, kolom tot paal<span class="alleen-scherm">, met de paalafwijking</span><span class="alleen-scherm"></span>'
    a_v', vrij, kolom tot paal<span class="alleen-afdruk"></span><span class="kolom-4"></span>'

    G_poer = 25 kN/m^3*l_poer*b_poer*h_poer to kN', eigen gewicht<span class="alleen-scherm"></span>'
    G_poer', eigen gewicht<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    #hide
    γ_Ga = if(CC ≡ 1; 1.2; if(CC ≡ 3; 1.5; 1.35))
    #show
    F_tot = F_Ed + γ_Ga*G_poer to kN', UGT met eigen gewicht<span class="alleen-scherm"></span>'
    F_tot', UGT met eigen gewicht<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    F_fr,t = F_fr + G_poer to kN', BGT met eigen gewicht<span class="alleen-scherm"></span>'
    F_fr,t', BGT met eigen gewicht<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    R_Ed = F_tot/2*(1 + 2*e_p/a_hoh) to kN', grootste paalreactie<span class="alleen-scherm">, door te geven aan de toetsing van de paal</span><span class="alleen-scherm"></span>'
    R_Ed', grootste paalreactie<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    M_dwars = F_tot*e_p to kN*m', dwars op de paallijn<span class="alleen-scherm">, uit de afwijking; dit moment moet buiten dit blad zijn opgenomen</span><span class="alleen-scherm"></span>'
    M_dwars', dwars op de paallijn<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    l_t = a_hoh/2 + e_p - e_k', arm tot paalhart<span class="alleen-scherm">, van het zwaartepunt van de halve kolom</span><span class="alleen-scherm"></span>'
    l_t', arm tot paalhart<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    M_t = F_tot/2*l_t to kN*m', moment staafwerk<span class="alleen-scherm"></span>'
    M_t', moment staafwerk<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    σ_ccc = 1.0*ν_s*f_cd', (6.60)<span class="alleen-scherm">, k<sub>1</sub>·ν′·f<sub>cd</sub></span><span class="alleen-scherm"></span>'
    σ_ccc', (6.60)<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    #hide
    ξ_x = 2*M_t/(c_ye*σ_ccc*d_eff^2)
    x_m = d_eff*(1 - sqrt(max(1 - ξ_x; 0)))
    #show
    z_u = min(d_eff - x_m/2; 0.9*d_eff)', hefboomsarm UGT<span class="alleen-scherm">, uit de drukzone onder de kolom, ten hoogste 0,9·d</span><span class="alleen-scherm"></span>'
    z_u', hefboomsarm UGT<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    x_c = 2*(d_eff - z_u)', drukzone<span class="alleen-scherm"></span>'
    x_c', drukzone<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    #hide
    θ = atan(z_u/l_t)
    #show
    θ_g = θ*180/π', hoek diagonaal, graden<span class="alleen-scherm"></span>'
    θ_g', hoek diagonaal, graden<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    H_s = z_u/sin(θ)', lengte diagonaal<span class="alleen-scherm"></span>'
    H_s', lengte diagonaal<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
    T_Ed = M_t/z_u to kN', trekband<span class="kolom-2"></span>'
    F_c = R_Ed/sin(θ) to kN', drukdiagonaal<span class="kolom-2"></span>'

    #hide
    sc_av = bool(a_v > 0 mm)
    sc_θ = bool(θ_g ≥ 45)
    sc_staal = bool(betonstaal ≠ 1)
    sc_d = bool(d_t ≤ 32 mm)*bool(d_s ≤ 32 mm)*bool(d_z ≤ 32 mm)*bool(d_b ≤ 32 mm)*bool(d_hp ≤ 32 mm)
    scope_ok = sc_av*sc_θ*sc_staal*sc_d
    #show

    #if scope_ok ≡ 1
        #hide
        k_n = if(n_hp ≥ 1; 0.85; 0.75)
        σ_cct = k_n*ν_s*f_cd
        σ_d = 0.6*ν_s*f_cd
        a_A = c_xe/2*sin(θ) + x_c*cos(θ)
        u_b = 2*(a_t - t_in)
        a_B = p_xe*sin(θ) + u_b*cos(θ)
        a_m = (a_A + a_B)/2
        a_min = min(a_A; a_B)
        a_y = min(c_ye; p_ye)
        n_sb = floor(a_v/s_s)
        n_sp = floor((a_v/2 + p_x)/s_s)
        n_sk = floor((a_v/2 + c_x/2)/s_s)
        n_bn = floor(n_s/2)
        N_v = n_sb*n_s*A_sb
        N_h = 2*n_z*A_z
        b_w = min(b_poer; 0.5*H_s + 0.65*a_y)
        u_0k = 2*c_ye
        u_0p = min(p_ye + 3*d_eff; p_ye + 2*p_xe)
        v_Rd = 0.4*ν_v*f_cd
        #show

        # 3. UGT: staafwerk, knopen en splijtkrachten

        T_Rd = A_s*f_yd to kN', 6.5.3<span class="kolom-2"></span>'
        UC_T = T_Ed/T_Rd'<span class="kolom-2"></span>'
        #hide
        M_Emin = f_ctm*b_poer*h_poer^2/6
        A_min1 = M_Emin/(0.9*d_eff*f_yd)
        A_min2 = 1.25*T_Ed/f_yd
        #show
        A_smin = min(A_min1; A_min2)', 9.2.1.1 (NB)<span class="alleen-scherm">, kleinste van M<sub>E,min</sub> = f<sub>ctm</sub>·W en 1,25 maal de benodigde wapening</span><span class="alleen-scherm"></span>'
        A_smin', 9.2.1.1 (NB)<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        UC_A = max(A_smin/A_s; A_s/(0.04*b_poer*h_poer))', ook A<sub>s,max</sub> = 0,04·A<sub>c</sub><span class="alleen-scherm"></span>'
        k_n', 6.5.4(4) (NB)<span class="alleen-scherm">, k<sub>2</sub> = 0,85 met haarspelden; zonder haarspelden geeft de NB geen waarde en rekent het blad met k<sub>3</sub> = 0,75</span><span class="kolom-4"></span>'
        σ_cct', (6.61)<span class="kolom-4"></span>'
        n_sb', beugels in a<sub>v</sub><span class="kolom-4"></span>'
        σ_m = F_c/(a_m*b_w) to N/mm^2', diagonaal<span class="alleen-scherm">, halverwege: in het vlak de gemiddelde breedte, dwars b<sub>ef</sub> uit figuur 6.25</span><span class="alleen-scherm"></span>'
        σ_m', diagonaal<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        σ_d', (6.56)<span class="kolom-4"></span>'
        σ_A = F_c/(a_A*c_ye) to N/mm^2', kolomknoop, diagonaal<span class="alleen-scherm"></span>'
        σ_A', kolomknoop, diagonaal<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        σ_B = F_c/(a_B*p_ye) to N/mm^2', paalknoop, diagonaal<span class="alleen-scherm"></span>'
        σ_B', paalknoop, diagonaal<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        R_sx = f_yd*(N_v*cos(θ) + N_h*sin(θ))/2 to kN', beugels en zijstaven<span class="alleen-scherm">, per helft van de diagonaal: figuur 6.25 heeft twee trekkrachten</span><span class="alleen-scherm"></span>'
        R_sx', beugels en zijstaven<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        σ_0 = F_Ed/A_k to N/mm^2', onder de kolom<span class="alleen-scherm"></span>'
        σ_0', onder de kolom<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        σ_1 = R_Ed/A_p to N/mm^2', op de paal<span class="alleen-scherm"></span>'
        σ_1', op de paal<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        UC_ccc = max(σ_0/σ_ccc; σ_A/σ_ccc; ξ_x)', knoop CCC<span class="alleen-scherm"></span>'
        UC_cct = max(σ_1; σ_B)/σ_cct', knoop CCT<span class="alleen-scherm"></span>'
        UC_d = σ_m/σ_d', drukdiagonaal<span class="alleen-scherm"></span>'
        T_sx = max(0.25*(1 - 0.7*a_min/H_s)*F_c; 0 kN) to kN', splijtkracht in het vlak, (6.59) (NB)<span class="alleen-scherm"></span>'
        T_sx', splijtkracht in het vlak<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        UC_sx = if(T_sx > 0 kN; T_sx/R_sx; 0)', splijtkracht in het vlak<span class="alleen-scherm"></span>'
        T_sp = max(if(b_poer ≤ H_s/2; 0.25*(b_poer - p_ye)/b_poer*F_c; 0.25*(1 - 0.7*p_ye/H_s)*F_c); 0 kN) to kN', splijtkracht dwars, paalzijde<span class="alleen-scherm">, (6.58) of (6.59)</span><span class="alleen-scherm"></span>'
        T_sp', splijtkracht dwars, paalzijde<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        R_sp = f_yd*(n_hp*A_hp + n_sp*n_bn*A_sb) to kN', haarspelden en onderbenen<span class="alleen-scherm">, van de beugels boven de paal en tot halverwege a<sub>v</sub></span><span class="alleen-scherm"></span>'
        R_sp', haarspelden en onderbenen<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        T_sk = max(if(b_poer ≤ H_s/2; 0.25*(b_poer - c_ye)/b_poer*F_c; 0.25*(1 - 0.7*c_ye/H_s)*F_c); 0 kN) to kN', splijtkracht dwars, kolomzijde<span class="alleen-scherm">, (6.58) of (6.59)</span><span class="alleen-scherm"></span>'
        T_sk', splijtkracht dwars, kolomzijde<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        R_sk = f_yd*n_sk*n_bn*A_sb to kN', bovenbenen<span class="alleen-scherm">, van de beugels onder de halve kolom en tot halverwege a<sub>v</sub></span><span class="alleen-scherm"></span>'
        R_sk', bovenbenen<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        #hide
        f_ctd = f_ctk/1.5
        f_bd = 2.25*1.0*1.0*f_ctd
        h_in = h_poer - c_o - c_z - 2*d_s
        l_bhp = if(n_hp > 0; d_hp/4*f_yd/f_bd; 0 mm)
        #show
        UC_sy = max(if(T_sp > 0 kN; T_sp/R_sp; 0); if(T_sk > 0 kN; T_sk/R_sk; 0); l_bhp/h_in)', splijtkracht dwars, en de lengte van de haarspelden<span class="alleen-scherm"></span>'
        V_max = 0.5*b_w*d_eff*ν_v*f_cd to kN', (6.5)<span class="alleen-scherm">, bovengrens dwarskracht</span><span class="alleen-scherm"></span>'
        V_max', (6.5)<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        UC_V = R_Ed/V_max', dwarskracht<span class="alleen-scherm"></span>'
        v_k = 1.15*F_Ed/(u_0k*d_eff) to N/mm^2', langs de kolom<span class="alleen-scherm">, alleen de twee vlakken naar de palen</span><span class="alleen-scherm"></span>'
        v_k', langs de kolom<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        v_p = 1.4*R_Ed/(u_0p*d_eff) to N/mm^2', langs de paal<span class="alleen-scherm"></span>'
        v_p', langs de paal<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        v_Rd', 6.4.5(3) (NB)<span class="alleen-scherm">, v<sub>Rd,max</sub> = 0,4·ν·f<sub>cd</sub></span><span class="kolom-4"></span>'
        UC_v = max(v_k; v_p)/v_Rd', pons<span class="alleen-scherm"></span>'

        # 4. Verankering van de trekband

        #hide
        σ_sd = T_Ed/A_s
        l_rqd = d_t/4*σ_sd/f_bd
        a_v2 = s_t - d_t
        c_1 = (b_poer - b_band)/2
        c_b = c_o + d_o
        c_d = if(vorm_t ≡ 2; if(n_tl > 1; min(a_v2/2; c_1); c_1); if(n_tl > 1; min(a_v2/2; c_1; c_b); min(c_1; c_b)))
        α_1 = if(vorm_t ≡ 2; if(c_d > 3*d_t; 0.7; 1.0); 1.0)
        α_2o = if(vorm_t ≡ 2; 1 - 0.15*(c_d - 3*d_t)/d_t; 1 - 0.15*(c_d - d_t)/d_t)
        α_2 = min(1; max(0.7; α_2o))
        l_bmin = max(0.3*l_rqd; 10*d_t; 100 mm)
        l_bd = max(α_1*α_2*l_rqd; l_bmin)
        'De verankering begint bij de binnenkant van de paal (6.5.4(7)), met de paal naar buiten verschoven; voor twee lagen de bovenste, die het kortst is.
        l_h = l_poer/2 - c_z - (a_hoh/2 - p_x/2 + e_p) - (lagen - 1)*(d_t + s_v) - if(vorm_t ≡ 2; d_t/2; 0 mm)
        r_m = (D_m + d_t)/2
        l_av = if(vorm_t ≡ 2; l_h + l_op - (2 - π/2)*r_m; l_h)
        n_ein = if(vorm_t ≡ 2; a_tb + l_op + c_z; 0 mm)
        #show
        f_bd', (8.2)<span class="alleen-scherm">, 2,25·η<sub>1</sub>·η<sub>2</sub>·f<sub>ctd</sub>, goede aanhechting</span><span class="kolom-4"></span>'
        l_rqd', (8.3)<span class="alleen-scherm">, l<sub>b,rqd</sub></span><span class="kolom-4"></span>'
        c_d', figuur 8.3<span class="kolom-4"></span>'
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
            a_b = if(n_tl > 1; min(s_t/2; c_1 + d_t/2); c_1 + d_t/2)
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
        ρ_b = A_s/(b_poer*d_eff)
        x_e = d_eff*(sqrt((α_e*ρ_b)^2 + 2*α_e*ρ_b) - α_e*ρ_b)
        h_ce = min(2.5*(h_poer - d_eff); (h_poer - x_e)/3; h_poer/2)
        ρ_p = A_s/(b_poer*h_ce)
        k_2 = 1 - h_ce/(2*(h_poer - x_e))
        c_w = c_o + d_o
        sr_max1 = 3.4*c_w + 0.8*k_2*0.425*d_t/ρ_p
        sr_max2 = max((50 - 0.8*f_ck/(1 N/mm^2))*d_t; 15*d_t)
        sr_ver = 1.3*(h_poer - x_e)
        s_hoh = if(n_tl > 1; s_t; b_poer)
        sr_kort = bool(s_hoh ≤ 5*(c_w + d_t/2))*bool(c_1 ≤ 5*(c_w + d_t/2))
        s_rmax = if(sr_kort ≡ 1; min(sr_max1; sr_max2); sr_ver)
        'Hefboomsarm voor de BGT: een staafwerk dat de lineair-elastische spanningen volgt (5.6.4(2)).
        z_el = if(a_hoh < h_poer; 0.6*a_hoh; 0.2*(a_hoh + 2*h_poer))
        z_s = min(z_u; z_el)
        T_fr = F_fr,t/2*l_t/z_s
        σ_s = T_fr/A_s
        ε_w1 = (σ_s - 0.4*f_ctm/ρ_p*(1 + α_e*ρ_p))/E_s
        ε_w = max(ε_w1; 0.6*σ_s/E_s)
        'De vereiste dekking (4.4.1.2, 4.4.1.3 van de NB): S4 bij 50 jaar, S6 bij 100 jaar, in tabel 4.4N steeds 5 mm per klasse.
        S_kl = if(DesignLife ≥ 100; 6; if(DesignLife ≥ 75; 5; 4))
        c_dur4 = if(milieu ≡ 1; 15; if(milieu ≡ 2; 25; if(milieu ≡ 3; 30; if(milieu ≡ 4; 35; 40))))
        c_dur = (c_dur4 + 5*(S_kl - 4))*(1 mm)
        Δ_g = if(d_g > 32 mm; 5 mm; 0 mm)
        c_nomb = max(d_o + Δ_g; c_dur; 10 mm) + 5 mm
        k_ond = if(ondergrond ≡ 1; c_dur + 10 mm; c_dur + 50 mm)
        c_reqo = max(c_nomb; k_ond)
        c_reqt = max(d_t + Δ_g; c_dur; 10 mm) + 5 mm
        c_reqb = max(max(d_z; d_b) + Δ_g; c_dur; 10 mm) + 5 mm
        c_reqz = if(ondergrond ≡ 1; c_nomb; max(c_nomb; c_dur + 50 mm))
        w_tab = if(milieu ≡ 1; 0.40; if(milieu ≤ 3; 0.30; 0.20))*(1 mm)
        k_x = if(milieu ≡ 1; 1; min(2; max(1; c_o/c_reqo)))
        w_lim = w_tab*k_x
        #show
        z_s', arm BGT<span class="alleen-scherm">, lineair-elastisch, 5.6.4(2)</span><span class="kolom-4"></span>'
        σ_s = T_fr/A_s to N/mm^2', 7.3.1(8)<span class="alleen-scherm">, staalspanning, frequent</span><span class="alleen-scherm"></span>'
        σ_s', 7.3.1(8)<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
        s_rmax', (7.11) (NB) of (7.14)<span class="alleen-scherm">, s<sub>r,max</sub></span><span class="kolom-4"></span>'
        ε_w', (7.9)<span class="alleen-scherm">, ε<sub>sm</sub> − ε<sub>cm</sub></span><span class="kolom-4"></span>'
        w_k = s_rmax*ε_w to mm', (7.8)<span class="alleen-scherm">, scheurwijdte</span><span class="kolom-2"></span>'
        w_lim', tabel 7.1N (NB)<span class="alleen-scherm">, met k<sub>x</sub></span><span class="kolom-2"></span>'
        UC_w = max(w_k/w_lim; σ_s/f_yk)', scheurwijdte, en de staalspanning onder de vloeigrens<span class="alleen-scherm"></span>'
        #if h_poer ≥ 1000 mm
            A_huid = 0.4*0.5*f_ctm*b_poer*h_poer/2/f_yk', huidwapening, 7.3.3(3)<span class="alleen-scherm"></span>'
            A_huid', 7.3.3(3)<span class="alleen-afdruk"></span><span class="kolom-4"></span>'
            UC_h = A_huid/max(2*n_z*A_z; 1 mm^2)'<span class="alleen-scherm"></span>'
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
        s_bb = (b_poer - 2*c_z - 2*d_s - d_b)/max(n_b - 1; 1)
        s_tb = (b_poer - 2*c_z - d_s)/(n_s - 1)
        s_kp = p_x/(n_hp + p_x/s_s*floor(n_s/2))
        UC_zb = if(n_z > 0; (a_tb + d_t/2 + d_z/2)/(c_o + d_s + s_zv); 0)
        UC_sp = max(if(n_tl > 1; vrij(s_t; d_t); 0); vrij(s_s/floor(n_s/2); d_s); vrij(s_tb; d_s); if(n_z > 0; vrij(s_zv; d_z); 0); if(n_b > 1; vrij(s_bb; d_b); 0); vrij(s_kp; d_o); UC_zb)
        b_in = b_poer - 2*c_z - 2*d_s
        b_zone = p_ye + 2*max(c_o + d_o + d_t/2 - t_in; 0 mm)
        UC_bd = if(min(b_in; b_zone) > 0 mm; max(b_band/b_zone; (b_band + if(n_hp > 0; 2*d_hp; 0 mm))/b_in); 99)
        UC_min = max(8 mm/d_t; 5 mm/d_s; if(n_z > 0; 6 mm/d_z; 0); if(n_b > 0; 6 mm/d_b; 0); if(n_hp > 0; 8 mm/d_hp; 0))
        UC_kop = t_in/c_o
        o_x = (l_poer - a_hoh - p_x)/2
        o_y = (b_poer - p_y)/2
        UC_rd = (c_z + e_p)/max(min(o_x; o_y); 1 mm)
        UC_dek = max(c_reqo/c_o; c_reqt/(c_o + d_o); c_reqz/c_z; c_reqt/c_z; c_reqb/(c_z + d_s))
        A_db = 0.001*b_poer*(1000 mm)
        A_vz = A_sb*(1000 mm)/s_s
        A_hz = if(n_z > 0; n_z*A_z*(1000 mm)/h_in; 0 mm^2)
        s_db = min(2*b_poer; 300 mm)
        UC_net = max(A_db/A_vz; A_db/max(A_hz; 1 mm^2); s_s/s_db; s_zv/s_db)
        ρ_w = (n_s*A_sb)/(s_s*b_poer)
        ρ_wm = max(0.08*sqrt(f_ck/(1 N/mm^2))/500; 0.16*f_ctm/f_yk)
        s_l = min(0.75*d_eff; 300 mm)
        s_tm = min(0.75*d_eff; 500 mm)
        UC_bg = max(ρ_wm/ρ_w; s_s/s_l; s_tb/s_tm)
        #show
        b_band', breedte trekband<span class="kolom-3"></span>'
        c_reqo', vereist onder, 4.4.1.3 (NB)<span class="kolom-3"></span>'
        c_reqz', vereist zij en boven<span class="kolom-3"></span>'
        UC_min'<span class="alleen-scherm">, kleinste staafdiameters, 9.8.1(3), 9.2.1.1(5) en 9.2.2(9) (NB)</span><span class="alleen-scherm"></span>'
        UC_sp'<span class="alleen-scherm">, vrije ruimte tussen de staven, 8.2(2)</span><span class="alleen-scherm"></span>'
        UC_bd'<span class="alleen-scherm">, binnen de zone boven de paal, 9.8.1(3)</span><span class="alleen-scherm"></span>'
        UC_kop'<span class="alleen-scherm">, wapening boven de paalkop; figuur 9.11 noemt 50 mm inbedding bij gebruik van 9.8.1(5), dat dit blad niet gebruikt</span><span class="alleen-scherm"></span>'
        UC_rd'<span class="alleen-scherm">, paal tot rand, met de afwijking, 9.8.1(1)</span><span class="alleen-scherm"></span>'
        UC_dek'<span class="alleen-scherm">, dekking</span><span class="alleen-scherm"></span>'
        UC_net'<span class="alleen-scherm">, wapeningsnet op de zijvlakken, 9.7</span><span class="alleen-scherm"></span>'
        UC_bg'<span class="alleen-scherm">, beugels, 9.2.2 (NB)</span><span class="alleen-scherm"></span>'

        #hide
        UC_hoogst = max(UC_T; UC_A; UC_ccc; UC_cct; UC_d; UC_sx; UC_sy; UC_V; UC_v; UC_l; UC_D; UC_w; UC_h; UC_sp; UC_bd; UC_min; UC_kop; UC_rd; UC_dek; UC_net; UC_bg)
        #show

        # 7. Samenvatting

        '<table style="width:100%; border-collapse:collapse; font-size:0.9em; line-height:1.15;">
        '<tr style="border-bottom:2px solid #374151;"><th style="text-align:left; padding:2px 8px;">Toets</th><th style="text-align:left; padding:2px 8px;">Artikel</th><th style="text-align:right; padding:2px 8px;">UC</th><th style="text-align:left; padding:2px 8px;">Uitkomst</th></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Trekband</td><td style="padding:1px 8px;">6.5.3</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_T)'">'ru(UC_T)'</td><td style="padding:1px 8px; color:'kleur(UC_T)'">'oordeel(UC_T)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">A<sub>s,min</sub> en A<sub>s,max</sub></td><td style="padding:1px 8px;">9.2.1.1</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_A)'">'ru(UC_A)'</td><td style="padding:1px 8px; color:'kleur(UC_A)'">'oordeel(UC_A)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Knoop onder de kolom (CCC)</td><td style="padding:1px 8px;">6.5.4(4)a</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_ccc)'">'ru(UC_ccc)'</td><td style="padding:1px 8px; color:'kleur(UC_ccc)'">'oordeel(UC_ccc)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Knoop boven de paal (CCT)</td><td style="padding:1px 8px;">6.5.4(4)b</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_cct)'">'ru(UC_cct)'</td><td style="padding:1px 8px; color:'kleur(UC_cct)'">'oordeel(UC_cct)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Drukdiagonaal</td><td style="padding:1px 8px;">6.5.2(2)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_d)'">'ru(UC_d)'</td><td style="padding:1px 8px; color:'kleur(UC_d)'">'oordeel(UC_d)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Splijtkracht in het vlak</td><td style="padding:1px 8px;">6.5.3(3)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_sx)'">'ru(UC_sx)'</td><td style="padding:1px 8px; color:'kleur(UC_sx)'">'oordeel(UC_sx)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Splijtkracht dwars</td><td style="padding:1px 8px;">6.5.3(3)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_sy)'">'ru(UC_sy)'</td><td style="padding:1px 8px; color:'kleur(UC_sy)'">'oordeel(UC_sy)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Dwarskracht, bovengrens</td><td style="padding:1px 8px;">6.2.2(6)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_V)'">'ru(UC_V)'</td><td style="padding:1px 8px; color:'kleur(UC_V)'">'oordeel(UC_V)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Pons langs kolom en paal</td><td style="padding:1px 8px;">6.4.5(3)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_v)'">'ru(UC_v)'</td><td style="padding:1px 8px; color:'kleur(UC_v)'">'oordeel(UC_v)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Verankering trekband</td><td style="padding:1px 8px;">8.4, 6.5.4(7)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_l)'">'ru(UC_l)'</td><td style="padding:1px 8px; color:'kleur(UC_l)'">'oordeel(UC_l)'</td></tr>
        #if vorm_t ≡ 2
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Ombuiging en been</td><td style="padding:1px 8px;">8.3</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_D)'">'ru(UC_D)'</td><td style="padding:1px 8px; color:'kleur(UC_D)'">'oordeel(UC_D)'</td></tr>
        #else
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Ombuiging en been</td><td style="padding:1px 8px;">8.3</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#64748b;">niet van toepassing<span class="alleen-scherm">, rechte staaf</span></td></tr>
        #end if
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Scheurwijdte trekband</td><td style="padding:1px 8px;">7.3.4 (NB)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_w)'">'ru(UC_w)'</td><td style="padding:1px 8px; color:'kleur(UC_w)'">'oordeel(UC_w)'</td></tr>
        #if h_poer ≥ 1000 mm
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Huidwapening</td><td style="padding:1px 8px;">7.3.3(3)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_h)'">'ru(UC_h)'</td><td style="padding:1px 8px; color:'kleur(UC_h)'">'oordeel(UC_h)'</td></tr>
        #else
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Huidwapening</td><td style="padding:1px 8px;">7.3.3(3)</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#64748b;">niet van toepassing<span class="alleen-scherm">, h kleiner dan 1000 mm</span></td></tr>
        #end if
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Diameters en vrije ruimte</td><td style="padding:1px 8px;">9.8.1(3), 8.2(2)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(max(UC_min; UC_sp))'">'ru(max(UC_min; UC_sp))'</td><td style="padding:1px 8px; color:'kleur(max(UC_min; UC_sp))'">'oordeel(max(UC_min; UC_sp))'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Trekband boven de paal</td><td style="padding:1px 8px;">9.8.1(3)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_bd)'">'ru(UC_bd)'</td><td style="padding:1px 8px; color:'kleur(UC_bd)'">'oordeel(UC_bd)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Paalkop en rand</td><td style="padding:1px 8px;">9.8.1(1)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(max(UC_kop; UC_rd))'">'ru(max(UC_kop; UC_rd))'</td><td style="padding:1px 8px; color:'kleur(max(UC_kop; UC_rd))'">'oordeel(max(UC_kop; UC_rd))'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Dekking</td><td style="padding:1px 8px;">4.4.1 (NB)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_dek)'">'ru(UC_dek)'</td><td style="padding:1px 8px; color:'kleur(UC_dek)'">'oordeel(UC_dek)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Wapeningsnet zijvlakken</td><td style="padding:1px 8px;">9.7</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_net)'">'ru(UC_net)'</td><td style="padding:1px 8px; color:'kleur(UC_net)'">'oordeel(UC_net)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Beugels</td><td style="padding:1px 8px;">9.2.2 (NB)</td><td style="padding:1px 8px; text-align:right; white-space:nowrap; font-weight:700; color:'kleur(UC_bg)'">'ru(UC_bg)'</td><td style="padding:1px 8px; color:'kleur(UC_bg)'">'oordeel(UC_bg)'</td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">V<sub>Rd,c</sub>, pons op u<sub>1</sub></td><td style="padding:1px 8px;">6.2.2(7), 6.4.4</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#64748b;">niet van toepassing<span class="alleen-scherm">, paal binnen 2d: via het staafwerk</span></td></tr>
        '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Spanningsbeperking BGT</td><td style="padding:1px 8px;">7.2 (NB)</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#64748b;">niet van toepassing<span class="alleen-scherm">, beton opgesloten; k<sub>3</sub> = 0,0 in de NB</span></td></tr>
        #if dwars ≡ 1
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Dwarsstabiliteit, H en M</td><td style="padding:1px 8px;">—</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#64748b;">aangetoond buiten dit blad<span class="alleen-scherm">, volgens de invoer</span></td></tr>
        #else
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Dwarsstabiliteit, H en M</td><td style="padding:1px 8px;">—</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#b45309; font-weight:700;">niet getoetst</td></tr>
        #end if
        #if e_p > 0 mm
        #else
            '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 8px;">Paalafwijking</td><td style="padding:1px 8px;">9.8.1(1)</td><td style="padding:1px 8px; text-align:right;">—</td><td style="padding:1px 8px; color:#b45309; font-weight:700;">niet getoetst</td></tr>
        #end if
        '</table>

        #hide
        eind_ok = bool(UC_hoogst ≤ 1)*bool(dwars ≡ 1)*bool(e_p > 0 mm)
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
            #if dwars ≡ 1
            #else
                'De dwarsstabiliteit, horizontale krachten en kolommomenten zijn niet aangetoond.
            #end if
            #if e_p > 0 mm
            #else
                'Er is geen paalafwijking ingevoerd, terwijl 9.8.1(1) die vraagt.
            #end if
        #end if
        'Buiten dit blad: draagvermogen van de palen (R<sub>Ed</sub>), aansluiting van de kolom, brand, vermoeiing en aardbeving.
    #else
        # 3. Buiten het toepassingsgebied
        #if sc_av ≡ 0
            '<span style="color:#b45309">De kolom en de paal overlappen in de lengterichting: er is geen staafwerk tussen die twee (a<sub>v</sub> ≤ 0, met de paalafwijking).</span>
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
        '<span class="oordeel" style="color:#b45309"><b>Eindoordeel: niet getoetst</b></span>, buiten het toepassingsgebied van dit blad.
    #end if
#else
    # 2. Invoercontrole
    #if ok_maten ≡ 0
        '<span style="color:#b91c1c">Ongeldig: elke maat van poer, paal, kolom en dekking moet groter zijn dan 0; de afwijking en de inbedding mogen 0 zijn.</span>
    #end if
    #if ok_staven ≡ 0
        '<span style="color:#b91c1c">Ongeldig: de trekband en de beugels moeten zijn ingevuld, ten minste twee beugelsneden, hele aantallen staven en een diameter bij elk aantal.</span>
    #end if
    #if ok_vorm ≡ 0
        '<span style="color:#b91c1c">Ongeldig: omgebogen staven vragen een opgebogen been en een doorndiameter.</span>
    #end if
    #if ok_last ≡ 0
        '<span style="color:#b91c1c">Ongeldig: de kolomlasten moeten druk zijn en de BGT-last mag niet groter zijn dan de UGT-last.</span>
    #end if
    #if ok_inpas ≡ 0
        '<span style="color:#b91c1c">Ongeldig: palen en kolom moeten binnen de poer vallen en de palen mogen elkaar niet raken.</span>
    #end if
    #if ok_project ≡ 1
    #else
        '<span style="color:#b91c1c">Ongeldig: de ontwerplevensduur of de gevolgklasse ontbreekt in de projectgegevens.</span>
    #end if
    #if ok_hoogte ≡ 0
        '<span style="color:#b91c1c">Ongeldig: de trekband moet binnen de poerhoogte en boven de paalkop liggen.</span>
    #end if
    '<span class="oordeel" style="color:#b91c1c"><b>Eindoordeel: ongeldige invoer, niet getoetst</b></span>
#end if
`;
