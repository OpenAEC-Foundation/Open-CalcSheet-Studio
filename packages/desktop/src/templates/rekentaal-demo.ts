/**
 * Open CalcSheet Studio demo — een voorbeeldblad dat laat zien wat
 * de rekentaal kan, met uitleg per onderdeel. De rode draad
 * is een stalen ligger op twee steunpunten.
 *
 * Hoofdstukken: tekst en koppen; variabelen en eenheden; invoervelden en
 * keuzelijsten; tabellen en de functie doorsnede(); functies; normtoetsing met
 * voorwaarden (EN 1990, EN 1993-1-1); herhalingen (#for, #repeat, #break);
 * matrices en het oplossen van een stelsel; een doorgaande ligger op drie
 * steunpunten met ligger(); grafieken en oplossers; parametrische tekeningen;
 * een afbeelding (@img, uit rekentaal-includes.ts); een ruimtelijk beeld
 * (@3d: de ligger op twee kolommen, draaibaar); een externe pagina (@iframe, laadt
 * pas na een klik); een parametrische balk in JavaScript (@js, loopt pas na een
 * klik); een spiekbriefje.
 *
 * Alles wat hier staat, rekent de kern (packages/core) echt door; het blad
 * staat in scripts/check-renders.mjs, net als de andere bladen.
 *
 * Elk invoerveld heeft een standaardwaarde (`L = ?{5}*(m)`), zodat het blad bij
 * het openen meteen een volledige uitwerking toont en de waarde in het veld
 * staat.
 *
 * Let op bij het schrijven van uitleg: een apostrof begint in een tekstregel
 * een formule, dus in de tekst staat hij als &#39;; net zo &#36; voor een
 * dollarteken, &#124; voor een verticale streep en &#123; voor een accolade.
 */

export const rekentaalDemo = `"Open CalcSheet Studio demo

'<i>Dit blad is zelf het voorbeeld: in de editor staat de rekentaal, in de uitwerking wat daaruit volgt. Elk hoofdstuk behandelt één onderdeel, met eerst een korte uitleg en de schrijfwijze (in <code>deze letter</code>) en daarna het werkende voorbeeld. De rode draad is een stalen ligger op twee steunpunten. Verander gerust iets in de editor of in de invoervelden en kijk wat er meebeweegt.</i>
'<i class="ook-afdruk">Dit blad laat zien wat de rekentaal kan, met een stalen ligger als rode draad. De uitleg en de hoofdstukken over alleen de schrijfwijze staan alleen op het scherm.</i>

'<h1>1. Tekst en koppen<span class="alleen-scherm"></span></h1>

'<i>Een regel die met <code>"</code> begint, is de titel van het blad (zie bovenaan). Met <code># 1. Kop</code> begin je een hoofdstuk en met <code>## 1.1 Kop</code> een paragraaf, tot zes niveaus diep. Een regel die met een apostrof <code>&#39;</code> begint, is tekst. Daarin mag HTML: <code>&lt;b&gt;</code> voor vet, <code>&lt;sub&gt;</code> voor een subscript en <code>&lt;sup&gt;</code> voor een superscript. Een regel die met <code>//</code> begint, is commentaar voor jezelf en verschijnt nergens.</i>

'Tekst met <b>vet</b>, <u>onderstreept</u>, f<sub>y,d</sub>, mm<sup>2</sup> en tekens als γ, σ, ≤, ⌀ en ±.<span class="alleen-scherm"></span>
// Deze regel is commentaar: hij staat alleen in de editor.

'<h2>1.1 Scherm en papier<span class="alleen-scherm"></span></h2>

'<i>Een tekstregel die helemaal cursief staat, zoals deze, geldt als uitleg: op het scherm zichtbaar, op papier weggelaten. Bijna alle uitleg op dit blad staat cursief, zodat het afdrukvoorbeeld beknopt blijft. Moet een cursieve regel toch op papier, schrijf dan <code>&lt;i class="ook-afdruk"&gt;</code>. Een leeg merkteken <code>&lt;span class="alleen-scherm"&gt;&lt;/span&gt;</code> ergens in een regel houdt de hele regel van het papier, ook een formule (in de toelichting erachter) of een invoerveld. Zo staan hoofdstuk 1 en 2 helemaal alleen op het scherm; hun kop is daarom een tekstregel met het merkteken erin: <code>&#39;&lt;h1&gt;2. …&lt;span class="alleen-scherm"&gt;&lt;/span&gt;&lt;/h1&gt;</code>. Het afdrukvoorbeeld laat zien wat er dan op papier overblijft.</i>

'<h1>2. Variabelen, formules en eenheden<span class="alleen-scherm"></span></h1>

'<i>Een toekenning schrijf je als <code>naam = waarde</code>, met de eenheid direct achter het getal. Een naam begint met een letter en mag cijfers, Griekse letters en liggende streepjes bevatten. Alles na het eerste streepje wordt subscript, een komma daarin ook: <code>f_y,d</code> staat er als f<sub>y,d</sub>. Tekst tussen apostrofs achter een formule komt er als toelichting naast: <code>t_pl = 12 mm&#39;, dikte&#39;</code>.</i>

t_pl = 12 mm', dikte van een strip<span class="alleen-scherm"></span>'
b_pl = 10 cm', breedte<span class="alleen-scherm"></span>'

'<i>Een formule toont drie stappen: de formule, de ingevulde waarden en de uitkomst. Eenheden rekenen vanzelf mee: millimeters maal centimeters geeft een oppervlak.</i>

A_pl = t_pl*b_pl'<span class="alleen-scherm"></span>'

'<i>Met <code>to</code> reken je om naar de eenheid die je wilt zien; <code>&#124;cm^2</code> achter de formule doet hetzelfde. Een moment schrijf je als <code>kN*m</code>, een spanning als <code>N/mm^2</code>.</i>

A_mm = t_pl*b_pl to mm^2'<span class="alleen-scherm"></span>'
A_cm = t_pl*b_pl|cm^2'<span class="alleen-scherm"></span>'
E = 210 GPa to N/mm^2', elasticiteitsmodulus van staal<span class="alleen-scherm"></span>'
ρ = 7850 kg/m^3', dichtheid van staal<span class="alleen-scherm"></span>'
g = 9.81 m/s^2', valversnelling<span class="alleen-scherm"></span>'
γ_s = ρ*g to kN/m^3', volumiek gewicht<span class="alleen-scherm"></span>'

'<i>Eenheden die niet bij elkaar passen, zoals meters plus kilonewtons, geven een foutmelding in plaats van een verkeerd getal. Een kaal getal krijg je door te delen door de eenheid; dat heb je nodig voor tekeningen, die in pixels rekenen.</i>

t_n = t_pl/(1 mm)'<span class="alleen-scherm"></span>'

'<i>Alleen een naam op een regel toont de waarde nog eens. Wat je niet wilt laten zien, zet je tussen <code>#hide</code> en <code>#show</code>: het wordt wel berekend en is verderop te gebruiken. In een tekstregel zet je een waarde tussen apostrofs: <code>&#39;I = &#39;I_pl&#39; mm&lt;sup&gt;4&lt;/sup&gt;</code>.</i>

A_mm'<span class="alleen-scherm"></span>'
#hide
I_pl = b_pl*t_pl^3/12 to mm^4
#show
'Verborgen berekend: de strip heeft om zijn zwakke as I = 'I_pl' mm<sup>4</sup>.<span class="alleen-scherm"></span>

# 3. Invoer: invoervelden en keuzelijsten

'<i>Met <code>F_k = ?{10}*(kN)</code> maak je een invoerveld met een eenheid en een standaardwaarde; zonder eenheid schrijf je <code>n = ?{3}</code>. Zolang je niets invult, rekent het blad met de standaardwaarde, en die staat ook in het veld; typ je een eigen waarde, dan telt die. Zonder <code>{…}</code> begint een veld op 0. Het invoerveld zelf staat alleen op het scherm; daaronder staat de waarde waarmee gerekend wordt, en die komt ook op papier.</i>

L = ?{5}*(m)', overspanning<span class="alleen-scherm"></span>'
F_k = ?{10}*(kN)', puntlast in het midden<span class="alleen-scherm"></span>'
L', overspanning'
F_k', puntlast in het midden, veranderlijk'

'<i>Vaste invoer staat gewoon als toekenning in het blad; die pas je aan in de editor.</i>

g_k = 2 kN/m', permanente last, zonder het eigen gewicht'
q_k = 3 kN/m', veranderlijke last, vloer in een woning'

'<i>Een keuzelijst is een blok van <code>@select naam "Omschrijving"</code> tot <code>@end</code>, met per regel <code>tekst = getal</code>. Het getal van de gekozen regel komt in de variabele.</i>

@select profiel "Profiel"
  IPE 200 = 1
  IPE 220 = 2
  IPE 240 = 3
  IPE 270 = 4
  IPE 300 = 5
  IPE 330 = 6
@end
@select staal "Staalsoort"
  S235 = 235
  S355 = 355
@end
@select met_F "Puntlast"
  meenemen = 1
  weglaten = 0
@end
f_y = staal*N/mm^2', vloeigrens, EN 1993-1-1 tabel 3.1 (t ≤ 40 mm)'

# 4. Tabellen en rekenfuncties

'<i>Een tabel is een matrix tussen vierkante haken: <code>;</code> scheidt de elementen in een rij, <code>&#124;</code> begint een nieuwe rij. De profieltabel heeft zeven rijen: het nummer, h, b, t<sub>w</sub>, t<sub>f</sub> en r in mm, en de massa in kg/m; elk profiel is een kolom. In de editor staat hij verborgen; de tabel hieronder is met een herhaling opgebouwd (zie hoofdstuk 7).</i>
#hide
profielen = [1; 2; 3; 4; 5; 6 | 200; 220; 240; 270; 300; 330 | 100; 110; 120; 135; 150; 160 | 5.6; 5.9; 6.2; 6.6; 7.1; 7.5 | 8.5; 9.2; 9.8; 10.2; 10.7; 11.5 | 12; 12; 15; 15; 15; 18 | 22.4; 26.2; 30.7; 36.1; 42.2; 49.1]
#show
'<table style="border-collapse:collapse; font-size:0.88em; line-height:1.3;">
'<tr style="border-bottom:1.5px solid #6b7280;"><th style="padding:1px 10px; text-align:left;">Profiel</th><th style="padding:1px 10px; text-align:right;">h</th><th style="padding:1px 10px; text-align:right;">b</th><th style="padding:1px 10px; text-align:right;">t<sub>w</sub></th><th style="padding:1px 10px; text-align:right;">t<sub>f</sub></th><th style="padding:1px 10px; text-align:right;">r [mm]</th><th style="padding:1px 10px; text-align:right;">G [kg/m]</th></tr>
#for i = 1 : 6
'<tr style="border-bottom:1px solid #e5e7eb; 'if(i ≡ profiel; "background:rgba(37,99,235,0.12)"; "")'"><td style="padding:0 10px;">IPE 'hlookup(profielen; i; 1; 2)'</td><td style="padding:0 10px; text-align:right;">'hlookup(profielen; i; 1; 2)'</td><td style="padding:0 10px; text-align:right;">'hlookup(profielen; i; 1; 3)'</td><td style="padding:0 10px; text-align:right;">'hlookup(profielen; i; 1; 4)'</td><td style="padding:0 10px; text-align:right;">'hlookup(profielen; i; 1; 5)'</td><td style="padding:0 10px; text-align:right;">'hlookup(profielen; i; 1; 6)'</td><td style="padding:0 10px; text-align:right;">'hlookup(profielen; i; 1; 7)'</td></tr>
#loop
'</table>

'<i><code>hlookup(M; waarde; i; j)</code> zoekt in rij i van M de kolom met die waarde en geeft het element uit rij j van die kolom. Met het nummer uit de keuzelijst haal je zo de maten van het gekozen profiel op; de eenheid zet je er met een vermenigvuldiging bij.</i>

h_p = hlookup(profielen; profiel; 1; 2)*mm
b_p = hlookup(profielen; profiel; 1; 3)*mm
t_w = hlookup(profielen; profiel; 1; 4)*mm
t_f = hlookup(profielen; profiel; 1; 5)*mm
r_p = hlookup(profielen; profiel; 1; 6)*mm
G_p = hlookup(profielen; profiel; 1; 7)*kg/m
g_eg = G_p*g to kN/m', eigen gewicht'

## 4.1 Doorsnedegrootheden uit de rekenkern

'<i>De rekenkern heeft constructieve functies die een matrix als invoer nemen. <code>doorsnede(D)</code> berekent de grootheden van een doorsnede uit rechthoeken, cirkels of buizen en I-profielen. Elk deel is een kolom in D met tien rijen: de soort (3 = I-profiel), h, b, t<sub>w</sub>, t<sub>f</sub>, r, de plaats y en z van het hart, de factor n en de stand (0 = staand). De uitkomst is een vector in mm: [A; y<sub>c</sub>; z<sub>c</sub>; I<sub>y</sub>; I<sub>z</sub>; …]. Element k van een vector v haal je op met <code>v.k</code>. <code>doorsnede_pl(D; 1)</code> geeft het plastisch weerstandsmoment om de y-as.</i>
#hide
D = [3 | h_p | b_p | t_w | t_f | r_p | 0 | 0 | 1 | 0]
ds = doorsnede(D)
pl = doorsnede_pl(D; 1)
#show
D'<span class="alleen-scherm"></span>'
A_p = ds.1*mm^2 to cm^2', oppervlak'
I_y = ds.4*mm^4 to cm^4', traagheidsmoment om de sterke as'
W_el = I_y/(h_p/2) to cm^3', elastisch weerstandsmoment'
W_pl = pl.1*mm^3 to cm^3', plastisch weerstandsmoment'
'<i>Ter controle: voor een IPE 200 geeft de profieltabel A = 28,5 cm², I<sub>y</sub> = 1943 cm⁴ en W<sub>pl,y</sub> = 220,6 cm³; de afrondingen tussen lijf en flens tellen mee.</i>

# 5. Functies

'<i>De gangbare wiskundige functies zijn er: <code>sqrt</code>, <code>abs</code>, <code>min</code>, <code>max</code>, <code>round</code>, <code>ceil</code>, <code>floor</code>, <code>sin</code>, <code>cos</code>, <code>tan</code>, <code>ln</code>, <code>log10</code> en <code>exp</code>, met de constanten <code>π</code> en <code>e</code>. Argumenten scheid je met een puntkomma. Geef een hoek met zijn eenheid (<code>35 deg</code>), dan klopt hij ongeacht de hoekinstelling van het programma.</i>

F_s = 25 kN', kracht in een schoor<span class="alleen-scherm"></span>'
α = 35 deg', hoek met de horizontaal<span class="alleen-scherm"></span>'
F_h = F_s*cos(α)'<span class="alleen-scherm"></span>'
F_v = F_s*sin(α)'<span class="alleen-scherm"></span>'
d_s = 12 mm', staafdiameter<span class="alleen-scherm"></span>'
A_s1 = π*d_s^2/4'<span class="alleen-scherm"></span>'
n_st = ceil(400 mm^2/A_s1)', aantal staven voor 400 mm²<span class="alleen-scherm"></span>'

## 5.1 Eigen functies

'<i>Een eigen functie schrijf je als <code>naam(a; b) = formule</code>. Daarna gebruik je hem als elke andere functie, met of zonder eenheden. Hieronder het weerstandsmoment van een rechthoek, toegepast op een houten balk; de maten komen uit twee invoervelden.</i>

W_rh(b; h) = b*h^2/6
b = ?{75}*(mm)', breedte van de balk<span class="alleen-scherm"></span>'
h = ?{225}*(mm)', hoogte van de balk<span class="alleen-scherm"></span>'
b', breedte van de balk'
h', hoogte van de balk'

'<i>Toets op buiging volgens EN 1995-1-1, voor C24 in klimaatklasse 1 met een belasting van middellange duur en een gegeven rekenmoment.</i>

M_d,h = 8 kN*m', rekenmoment (gegeven)'
f_m,k = 24 N/mm^2', C24 (EN 338)'
k_mod = 0.8', tabel 3.1: klimaatklasse 1, middellang'
γ_M = 1.3', tabel 2.3: massief hout'
k_h = max(1; min((150 mm/h)^0.2; 1.3))', 3.2(3), formule (3.1); 1 bij h ≥ 150 mm'
f_m,d = k_h*k_mod*f_m,k/γ_M', formule (2.14)'
σ_m,d = M_d,h/W_rh(b; h) to N/mm^2
UC_h = σ_m,d/f_m,d', formule (6.11), buiging om één as'

## 5.2 Functies met tekst

'<i>Een functie mag ook tekst teruggeven, met <code>if(voorwaarde; dan; anders)</code> om te kiezen. Tekst laat zich niet als formule tonen; de twee functies hieronder staan daarom verborgen. Ze kleuren het oordeel, hier en in hoofdstuk 6:</i>
'<code>oordeel(u) = if(u ≤ 1; "voldoet"; "voldoet niet")</code><br/><code>kleur(u) = if(u &gt; 1; "#b91c1c"; if(u &gt; 0.9; "#b45309"; "#047857"))</code><span class="alleen-scherm"></span>
#hide
oordeel(u) = if(u ≤ 1; "voldoet"; "voldoet niet")
kleur(u) = if(u > 1; "#b91c1c"; if(u > 0.9; "#b45309"; "#047857"))
#show
'Houten balk 'b' × 'h' mm, C24: <b style="color:'kleur(UC_h)'">UC = 'round(UC_h; 2)', 'oordeel(UC_h)'</b>

# 6. Normtoetsing met voorwaarden

'<i>Nu de stalen ligger: de belastingcombinaties volgens EN 1990 en de toetsen volgens EN 1993-1-1, met het artikel achter elke formule. Gevolgklasse CC2, met de factoren uit de Nederlandse nationale bijlage. De veranderlijke lasten q<sub>k</sub> en F<sub>k</sub> komen uit hetzelfde gebruik en tellen samen als één veranderlijke belasting; alle maxima liggen in het midden of bij de opleggingen.</i>

## 6.1 Belastingcombinaties (EN 1990)

ψ_0 = 0.4', categorie A, vloeren in woningen (NB tabel A1.1)'
F_Q = met_F*F_k', de puntlast, als die is meegenomen'
M_G = (g_k + g_eg)*L^2/8 to kN*m
M_Q = q_k*L^2/8 + F_Q*L/4 to kN*m
M_Ed,a = 1.35*M_G + 1.5*ψ_0*M_Q', formule (6.10a)'
M_Ed,b = 1.2*M_G + 1.5*M_Q', formule (6.10b)'
M_Ed = max(M_Ed,a; M_Ed,b)
V_G = (g_k + g_eg)*L/2 to kN
V_Q = q_k*L/2 + F_Q/2 to kN
V_Ed,a = 1.35*V_G + 1.5*ψ_0*V_Q', formule (6.10a)'
V_Ed,b = 1.2*V_G + 1.5*V_Q', formule (6.10b)'
V_Ed = max(V_Ed,a; V_Ed,b)

'<i>Met <code>#if voorwaarde</code> … <code>#else if</code> … <code>#else</code> … <code>#end if</code> toon en reken je alleen het deel dat van toepassing is. Vergelijken gaat met <code>&lt; &gt; ≤ ≥ ≡ ≠</code>, waarin <code>≡</code> betekent: is gelijk aan. Grootheden met een eenheid vergelijk je gewoon: <code>#if L &gt; 6 m</code>.</i>

#if M_Ed,a > M_Ed,b
  'Combinatie (6.10a) is maatgevend: de permanente last overheerst.
  γ_G = 1.35
  γ_Q = 1.5*ψ_0
#else
  'Combinatie (6.10b) is maatgevend.
  γ_G = 1.2
  γ_Q = 1.5
#end if
q_d = γ_G*(g_k + g_eg) + γ_Q*q_k', rekenwaarde van de verdeelde last'
F_d = γ_Q*F_Q', rekenwaarde van de puntlast'

## 6.2 Doorsnedeklasse (EN 1993-1-1 tabel 5.2)

ε = sqrt(235 N/mm^2/f_y)
c_f = (b_p - t_w - 2*r_p)/2', uitstekend deel van de flens'
c_w = h_p - 2*t_f - 2*r_p', recht deel van het lijf'
λ_f = c_f/(t_f*ε)
λ_w = c_w/(t_w*ε)
#if and(λ_f ≤ 9; λ_w ≤ 72)
  'Flens (c/t ≤ 9ε) en lijf (c/t ≤ 72ε) vallen in klasse 1: de doorsnede mag plastisch rekenen.
  W_y = W_pl
#else if and(λ_f ≤ 10; λ_w ≤ 83)
  'Flens (c/t ≤ 10ε) en lijf (c/t ≤ 83ε) vallen in klasse 2: de doorsnede mag plastisch rekenen.
  W_y = W_pl
#else
  'Klasse 3 of hoger: het blad rekent elastisch (klasse 4 valt buiten dit voorbeeld).
  W_y = W_el
#end if

## 6.3 Toetsen (EN 1993-1-1)

γ_M0 = 1.0', NB'
M_c,Rd = W_y*f_y/γ_M0 to kN*m', formule (6.13) of (6.14)'
UC_M = M_Ed/M_c,Rd', formule (6.12)'
A_fl = (2*b_p - t_w - 2*r_p)*t_f to mm^2', flenzen buiten lijf en afrondingen'
A_v,1 = A_p - A_fl', 6.2.6(3)a: A − 2·b·t<sub>f</sub> + (t<sub>w</sub> + 2·r)·t<sub>f</sub>'
A_v,2 = (h_p - 2*t_f)*t_w to mm^2', ondergrens η·h<sub>w</sub>·t<sub>w</sub> met η = 1,0'
A_v = max(A_v,1; A_v,2)
V_pl,Rd = A_v*f_y/(sqrt(3)*γ_M0) to kN', formule (6.18)'
UC_V = V_Ed/V_pl,Rd', formule (6.17)'
w_q = 5*(g_k + g_eg + q_k)*L^4/(384*E*I_y) to mm', karakteristiek, verdeelde last'
w_F = F_Q*L^3/(48*E*I_y) to mm', karakteristiek, puntlast'
w = w_q + w_F', in het midden'
w_max = L/250 to mm', gekozen grens'
UC_w = w/w_max
UC_max = max(UC_M; UC_V; UC_w)

#if UC_max ≤ 0.5
  '<b style="color:#047857">Ruim voldoende.</b> Het profiel is minder dan half benut; een lichter profiel kan waarschijnlijk ook.
#else if UC_max ≤ 1
  '<b style="color:#047857">Voldoende.</b> De maatgevende toets is benut tot 'round(100*UC_max)' %.
#else
  '<b style="color:#b91c1c">Onvoldoende.</b> Kies een zwaarder profiel of S355; hoofdstuk 7 laat zien welke profielen voldoen.
#end if
'Buiging <b style="color:'kleur(UC_M)'">'round(UC_M; 2)'</b> · dwarskracht <b style="color:'kleur(UC_V)'">'round(UC_V; 2)'</b> · doorbuiging <b style="color:'kleur(UC_w)'">'round(UC_w; 2)'</b>
'<b>Maatgevende UC = 'round(UC_max; 2)', 'oordeel(UC_max)'</b>

# 7. Herhalingen

'<i><code>#for i = 1 : n</code> … <code>#loop</code> herhaalt de regels ertussen voor i = 1, 2, … n. Binnen een herhaling mag alles staan: formules, tekst, voorwaarden en tekenopdrachten. Een tabel bouw je zo regel voor regel op met HTML: <code>&lt;table&gt;</code> op een tekstregel voor de herhaling, een <code>&lt;tr&gt;</code> per keer erin en <code>&lt;/table&gt;</code> erna.</i>

## 7.1 Het verloop langs de ligger (#for)

'<table style="border-collapse:collapse; font-size:0.88em; line-height:1.3;">
'<tr style="border-bottom:1.5px solid #6b7280;"><th style="padding:1px 12px; text-align:right;">x [m]</th><th style="padding:1px 12px; text-align:right;">M<sub>Ed</sub> [kNm]</th><th style="padding:1px 12px; text-align:right;">V<sub>Ed</sub> [kN]</th></tr>
#for i = 0 : 8
  #hide
  x_i = i*L/8
  M_i = (q_d*x_i*(L - x_i)/2 + F_d*min(x_i; L - x_i)/2)/(1 kN*m)
  V_i = (q_d*(L/2 - x_i) + F_d*if(x_i ≤ L/2; 0.5; -0.5))/(1 kN)
  #show
  '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:0 12px; text-align:right;">'round(x_i/(1 m); 3)'</td><td style="padding:0 12px; text-align:right;">'round(M_i; 1)'</td><td style="padding:0 12px; text-align:right;">'round(V_i; 1)'</td></tr>
#loop
'</table>
'<i>In het midden staat de dwarskracht direct links van de puntlast.</i>

## 7.2 Een vast aantal keer (#repeat)

'<i><code>#repeat n</code> … <code>#loop</code> herhaalt n keer; de teller staat in <code>_i</code>. Zolang een voorwaarde geldt, herhaal je met <code>#while voorwaarde</code> … <code>#loop</code>. Hier de buigtoets voor alle zes profielen uit de tabel, met dezelfde belasting en staalsoort en per profiel het eigen gewicht. Alle zes zijn bij buiging klasse 1.</i>
'<table style="border-collapse:collapse; font-size:0.88em; line-height:1.3;">
'<tr style="border-bottom:1.5px solid #6b7280;"><th style="padding:1px 12px; text-align:left;">Profiel</th><th style="padding:1px 12px; text-align:right;">W<sub>pl</sub> [cm³]</th><th style="padding:1px 12px; text-align:right;">M<sub>Ed</sub> [kNm]</th><th style="padding:1px 12px; text-align:right;">M<sub>c,Rd</sub> [kNm]</th><th style="padding:1px 12px; text-align:right;">UC</th></tr>
#repeat 6
  #hide
  h_j = hlookup(profielen; _i; 1; 2)
  b_j = hlookup(profielen; _i; 1; 3)
  tw_j = hlookup(profielen; _i; 1; 4)
  tf_j = hlookup(profielen; _i; 1; 5)
  r_j = hlookup(profielen; _i; 1; 6)
  g_j = hlookup(profielen; _i; 1; 7)*kg/m*g
  D_j = [3 | h_j | b_j | tw_j | tf_j | r_j | 0 | 0 | 1 | 0]
  W_j = doorsnede_pl(D_j; 1)[1]*mm^3
  M_Gj = (g_k + g_j)*L^2/8
  M_j = max(1.35*M_Gj + 1.5*ψ_0*M_Q; 1.2*M_Gj + 1.5*M_Q) to kN*m
  M_Rj = W_j*f_y/γ_M0 to kN*m
  UC_j = M_j/M_Rj
  #show
  '<tr style="border-bottom:1px solid #e5e7eb; 'if(_i ≡ profiel; "background:rgba(37,99,235,0.12)"; "")'"><td style="padding:0 12px;">IPE 'h_j'</td><td style="padding:0 12px; text-align:right;">'round(W_j/(1000 mm^3); 1)'</td><td style="padding:0 12px; text-align:right;">'round(M_j/(1 kN*m); 1)'</td><td style="padding:0 12px; text-align:right;">'round(M_Rj/(1 kN*m); 1)'</td><td style="padding:0 12px; text-align:right; font-weight:700; color:'kleur(UC_j)'">'round(UC_j; 2)'</td></tr>
#loop
'</table>

## 7.3 Voortijdig stoppen (#break)

'<i>Met <code>#break</code> stop je een herhaling zodra een voorwaarde is bereikt. De herhaling hieronder verhoogt de puntlast in stappen van 5 kN en stopt bij de eerste stap waarbij de buiging van het gekozen profiel niet meer voldoet.</i>
'<table style="border-collapse:collapse; font-size:0.88em; line-height:1.3;">
'<tr style="border-bottom:1.5px solid #6b7280;"><th style="padding:1px 12px; text-align:right;">F<sub>k</sub> [kN]</th><th style="padding:1px 12px; text-align:right;">M<sub>Ed</sub> [kNm]</th><th style="padding:1px 12px; text-align:right;">UC</th></tr>
#for k = 0 : 20
  #hide
  F_j = 5 kN*k
  M_Qj = q_k*L^2/8 + F_j*L/4
  M_k = max(1.35*M_G + 1.5*ψ_0*M_Qj; 1.2*M_G + 1.5*M_Qj) to kN*m
  UC_k = M_k/M_c,Rd
  #show
  '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:0 12px; text-align:right;">'F_j'</td><td style="padding:0 12px; text-align:right;">'round(M_k/(1 kN*m); 1)'</td><td style="padding:0 12px; text-align:right; font-weight:700; color:'kleur(UC_k)'">'round(UC_k; 2)'</td></tr>
  #if UC_k > 1
    #break
  #end if
#loop
'</table>
#if UC_k ≤ 1
  'Ook bij een puntlast van 100 kN voldoet de buiging nog.
#else if k > 0
  'De buiging voldoet tot en met F<sub>k</sub> = 'F_j - 5 kN' kN; bij 'F_j' kN niet meer.
#else
  'Zelfs zonder puntlast voldoet de buiging niet.
#end if

# 8. Matrices: een stelsel oplossen

'<i>Met matrices reken je als op papier: <code>A*B</code> vermenigvuldigt, <code>inverse(A)</code> keert om, <code>det(A)</code> is de determinant, <code>transp(A)</code> de getransponeerde en <code>lsolve(A; b)</code> lost het stelsel A·x = b op. Een matrix schrijf je rij voor rij: <code>;</code> tussen de elementen van een rij en <code>&#124;</code> tussen de rijen, dus <code>[a; b &#124; c; d]</code> heeft de rijen [a; b] en [c; d]. Een vector schrijf je als <code>[a; b; c]</code>. Een element lees je met <code>v.i</code> of <code>M.(i; j)</code>, en je kunt het ook een nieuwe waarde geven: <code>M.(i; j) = …</code>. <code>matrix(m; n)</code> maakt een matrix van m × n nullen. Matrices mogen eenheden dragen.</i>

## 8.1 Een stijfheidsmatrix opbouwen in een herhaling

'<i>Een gebouw van drie verdiepingen met stabiliteitswanden, voorgesteld als veren boven elkaar: verdieping i heeft stijfheid k<sub>i</sub> en op vloer i werkt windkracht F<sub>i</sub>. Veer i verbindt vloer i − 1 met vloer i. De herhaling telt de stijfheid van elke veer op de juiste plaatsen in K op (assembleren); de lus staat verborgen, daarna volgen K, F en de verplaatsingen u uit K·u = F.</i>

n_v = 3', aantal verdiepingen'
k_v = [40; 30; 20]*1 kN/mm', verdiepingsstijfheden, van onder naar boven'
F_v = [15; 15; 10]*1 kN', windkracht per vloer, van onder naar boven'
#hide
K = matrix(n_v; n_v)*1 kN/mm
#for i = 1 : n_v
  K.(i; i) = K.(i; i) + k_v.i
  #if i > 1
    K.(i - 1; i - 1) = K.(i - 1; i - 1) + k_v.i
    K.(i - 1; i) = K.(i - 1; i) - k_v.i
    K.(i; i - 1) = K.(i; i - 1) - k_v.i
  #end if
#loop
#show
K
u = lsolve(K; F_v)
u_1 = u.1', eerste vloer'
u_2 = u.2', tweede vloer'
u_3 = u.3', dak'

'<i>Controle langs twee andere wegen: met de inverse, <code>inverse(K)*F</code>, en met de hand. Elke verdieping draagt de windkracht op alle vloeren erboven.</i>

u_c = inverse(K)*F_v
u_3,hand = (F_v.1 + F_v.2 + F_v.3)/k_v.1 + (F_v.2 + F_v.3)/k_v.2 + F_v.3/k_v.3', = (F<sub>1</sub> + F<sub>2</sub> + F<sub>3</sub>)/k<sub>1</sub> + (F<sub>2</sub> + F<sub>3</sub>)/k<sub>2</sub> + F<sub>3</sub>/k<sub>3</sub>'
#if abs(u_3 - u_3,hand) + abs(u_c.3 - u_3,hand) < 0.0001 mm
  'Controle: lsolve, inverse(K)·F en de handberekening geven dezelfde verplaatsing van het dak.
#else
  '<b style="color:#b91c1c">Controle: lsolve, inverse(K)·F en de handberekening verschillen.</b>
#end if

## 8.2 Een niet-symmetrisch stelsel: evenwicht

'<i>Een matrix hoeft niet symmetrisch te zijn. De oplegreacties van een ligger op twee steunpunten met een puntlast F op afstand a van A volgen uit twee evenwichtsvergelijkingen: verticaal R<sub>A</sub> + R<sub>B</sub> = F, en momenten om A: 0·R<sub>A</sub> + L·R<sub>B</sub> = F·a. Elke vergelijking is een rij van A·R = b, met eenheden per rij.</i>

L_e = 6 m
a_e = 2 m
F_e = 12 kN
A_e = [1; 1 | 0; L_e]
b_e = [F_e; F_e*a_e]
R_e = lsolve(A_e; b_e)
R_A,e = R_e.1
R_B,e = R_e.2
R_A,e,hand = F_e*(L_e - a_e)/L_e', controle met de hand'

# 9. Doorgaande ligger op drie steunpunten

'<i>Voor een statisch onbepaalde ligger heeft de rekenkern <code>ligger(geo; last; EI)</code>. De geometrie heeft twee rijen: de plaatsen x van de punten en hun soort (1 = steunpunt, 2 = inklemming, 3 = scharnier, 0 = vrij einde). De belasting heeft vijf rijen, met per last een kolom: de soort (1 = verdeelde last van a tot b, 2 = puntlast in a), a, b, q<sub>a</sub> en q<sub>b</sub>. De uitkomst is een tabel met per punt langs de ligger x, V, M en w, in m, kN en kNm; <code>ligger_R</code> geeft per steunpunt x, de reactie R en het moment. Element (i; j) van een matrix M haal je op met <code>M.(i; j)</code>.</i>
'<i>Hier een ligger over drie steunpunten waarvan alleen het linkerveld belast is, met de buigstijfheid van het gekozen profiel.</i>

L_1 = ?{5}*(m)', linkerveld<span class="alleen-scherm"></span>'
L_2 = ?{5}*(m)', rechterveld<span class="alleen-scherm"></span>'
q_1 = ?{10}*(kN/m)', last op het linkerveld<span class="alleen-scherm"></span>'
#hide
geo = [0; L_1; L_1 + L_2 | 1; 1; 1]
last = [1 | 0 | L_1 | q_1 | q_1]
#show
L_1', linkerveld'
L_2', rechterveld'
q_1', gelijkmatige last op het linkerveld'
geo
last
EI = E*I_y to kN*m^2
#hide
R_l = ligger(geo; last; EI)
R_s = ligger_R(geo; last; EI)
#show
'Verborgen berekend: R<sub>l</sub> = ligger(geo; last; EI) en R<sub>s</sub> = ligger_R(geo; last; EI). De reacties zijn de tweede kolom van R<sub>s</sub>, de uitersten komen uit <code>ligger_ext</code>.<span class="alleen-scherm"></span>
R_A = R_s.(1; 2)*kN
R_B = R_s.(2; 2)*kN
R_C = R_s.(3; 2)*kN
M_B = ligger_int(R_l; 3; L_1)*kN*m', steunmoment boven B'
M_veld = ligger_ext(R_l; 3)[1]*kN*m', grootste veldmoment'
x_veld = ligger_ext(R_l; 3)[2]*m', plaats van het grootste veldmoment'
w_l = 1000*ligger_ext(R_l; 4)[1]*mm', grootste doorbuiging onder deze last'

'<i>Controle met de vergelijking van drie momenten: bij een gelijkmatige last op het linkerveld is 2·M<sub>B</sub>·(L<sub>1</sub> + L<sub>2</sub>) = −q·L<sub>1</sub>³/4. Daaruit volgen de reacties met het evenwicht van de twee velden. R<sub>C</sub> is negatief: de oplegging rechts moet de ligger omlaag houden.</i>

M_B,hand = -q_1*L_1^3/(8*(L_1 + L_2)) to kN*m
R_C,hand = M_B,hand/L_2 to kN
R_A,hand = q_1*L_1/2 + M_B,hand/L_1 to kN
Q_1 = q_1*L_1 to kN', totale last op het linkerveld'
R_som = R_A + R_B + R_C', som van de reacties, gelijk aan Q<sub>1</sub>'

#def steunpunt$(x$; y$)
  '<polygon points="'x$','y$' 'x$ - 9','y$ + 14' 'x$ + 9','y$ + 14'" style="fill:#e2e8f0; stroke:#334155; stroke-width:1.2"/>
  '<line x1="'x$ - 13'" y1="'y$ + 17'" x2="'x$ + 13'" y2="'y$ + 17'" style="stroke:#334155; stroke-width:1.2"/>
#end def
#def reactiepijl$(x$; R$)
  '<line x1="'x$'" y1="'y_r'" x2="'x$'" y2="'y_r + 24'" style="stroke:#1d4ed8; stroke-width:2"/>
  '<polygon points="'x$','if(R$ ≥ 0 kN; y_r - 3; y_r + 27)' 'x$ - 5','if(R$ ≥ 0 kN; y_r + 7; y_r + 17)' 'x$ + 5','if(R$ ≥ 0 kN; y_r + 7; y_r + 17)'" style="fill:#1d4ed8"/>
  '<text x="'x$'" y="'y_r + 40'" text-anchor="middle" style="fill:#1d4ed8; font-weight:700">'round(R$/(1 kN); 2)' kN</text>
#end def
#hide
L_t = (L_1 + L_2)/(1 m)
s9 = 380/L_t
x9_a = 50
x9_b = x9_a + s9*L_1/(1 m)
x9_c = x9_a + s9*L_t
y9 = 66
y_r = y9 + 24
n9 = max(3; round(2*L_1/(1 m)))
M9 = max(abs(ligger_ext(R_l; 3)[1]); abs(ligger_ext(R_l; 3)[3]); 0.001)
s9_m = 50/M9
y9_m = y9 + 140
#show
'<i>Het schema op schaal, met de reacties en de momentenlijn aan de trekzijde (met <code>ligger_svg</code>). De steunpunten en de reactiepijlen zijn macro’s: <code>#def naam&#36;(a&#36;; b&#36;)</code> … <code>#end def</code>, één keer beschreven en drie keer aangeroepen.</i>
'<svg viewBox="0 0 480 280" style="width:100%; max-width:560px; font-size:12px;">
'  <rect width="480" height="280" rx="6" style="fill:#fafaf9"/>
#for i = 0 : n9
'  <line x1="'x9_a + i*(x9_b - x9_a)/n9'" y1="'y9 - 40'" x2="'x9_a + i*(x9_b - x9_a)/n9'" y2="'y9 - 12'" style="stroke:#b45309; stroke-width:1.4"/>
'  <polygon points="'x9_a + i*(x9_b - x9_a)/n9','y9 - 4' 'x9_a + i*(x9_b - x9_a)/n9 - 3.5','y9 - 13' 'x9_a + i*(x9_b - x9_a)/n9 + 3.5','y9 - 13'" style="fill:#b45309"/>
#loop
'  <line x1="'x9_a'" y1="'y9 - 40'" x2="'x9_b'" y2="'y9 - 40'" style="stroke:#b45309; stroke-width:2"/>
'  <text x="'x9_a'" y="'y9 - 46'" style="fill:#b45309; font-weight:700">q = 'q_1' kN/m</text>
'  <rect x="'x9_a'" y="'y9 - 3'" width="'x9_c - x9_a'" height="6" style="fill:#94a3b8; stroke:#334155"/>
steunpunt$(x9_a; y9 + 3)
steunpunt$(x9_b; y9 + 3)
steunpunt$(x9_c; y9 + 3)
reactiepijl$(x9_a; R_A)
reactiepijl$(x9_b; R_B)
reactiepijl$(x9_c; R_C)
'  <line x1="'x9_a - 10'" y1="'y9_m'" x2="'x9_c + 10'" y2="'y9_m'" style="stroke:#334155"/>
'  <polygon points="'x9_a','y9_m' 'ligger_svg(R_l; 3; x9_a; s9; y9_m; s9_m)' 'x9_c','y9_m'" style="fill:rgba(239,68,68,0.18); stroke:#dc2626; stroke-width:1.6; stroke-linejoin:round"/>
'  <text x="'x9_a + s9*x_veld/(1 m)'" y="'y9_m + s9_m*M_veld/(1 kN*m) + 16'" text-anchor="middle" style="fill:#dc2626; font-weight:700">'round(M_veld/(1 kN*m); 1)' kNm</text>
'  <text x="'x9_b'" y="'y9_m + s9_m*M_B/(1 kN*m) - 6'" text-anchor="middle" style="fill:#dc2626; font-weight:700">'round(M_B/(1 kN*m); 1)' kNm</text>
'  <text x="472" y="274" text-anchor="end" style="fill:#64748b; font-size:10px">L1 = 'L_1' m · L2 = 'L_2' m</text>
'</svg>

'<i>Het verloop van het moment en de dwarskracht als grafiek met eenheden. <code>ligger_int(R; k; x)</code> geeft kolom k van de uitkomst in het punt x (k = 2 dwarskracht, k = 3 moment) als kaal getal in kN of kNm; vermenigvuldigd met de eenheid wordt het weer een grootheid. Met grenzen met een eenheid (<code>x = 0 m : L_1 + L_2</code>) rekent x in meters, en de eenheden komen bij de assen. <code>PlotHeight = 220</code> maakt de grafieken lager (standaard 320 pixels; de breedte zet je met <code>PlotWidth</code>).</i>
PlotHeight = 220'<span class="alleen-scherm"></span>'
$Plot{ligger_int(R_l; 3; x)*kN*m @ x = 0 m : L_1 + L_2}
'<span style="color:#D97706; font-weight:700;">━━ M</span> &nbsp; het moment langs de ligger; positief geeft trek aan de onderzijde.
$Plot{ligger_int(R_l; 2; x)*kN @ x = 0 m : L_1 + L_2}
'<span style="color:#D97706; font-weight:700;">━━ V</span> &nbsp; de dwarskracht langs de ligger.

# 10. Grafieken en oplossers

'<i><code>&#36;Plot{f(x) @ x = a : b}</code> tekent f(x) voor x van a tot b. Meer lijnen in één grafiek scheid je met <code>&amp;</code>, en een getal als lijn geeft een horizontale lijn. Krijgen de grenzen een eenheid (<code>x = 1 m : 12 m</code>), dan rekent x met die eenheid; zonder eenheid rekent de grafiek met kale getallen.</i>

## 10.1 De unity check als functie van de overspanning

'<i>Een eigen functie in een grafiek: de unity check voor buiging als functie van de overspanning x, voor beide combinaties, met de grens 1 erbij.</i>

M_a(x) = 1.35*(g_k + g_eg)*x^2/8 + 1.5*ψ_0*(q_k*x^2/8 + F_Q*x/4)', formule (6.10a)'
M_b(x) = 1.2*(g_k + g_eg)*x^2/8 + 1.5*(q_k*x^2/8 + F_Q*x/4)', formule (6.10b)'
UC_L(x) = max(M_a(x); M_b(x))/M_c,Rd
$Plot{UC_L(x) & 1 @ x = 1 m : 12 m}
'<span style="color:#D97706; font-weight:700;">━━ UC voor buiging</span> &nbsp; <span style="color:#2563EB; font-weight:700;">━━ grens 1</span>

## 10.2 Oplossers: nulpunt en maximum

'<i>Een oplosser zoekt een waarde voor je: <code>&#36;Root{f(x) = c @ x = a : b}</code> zoekt tussen a en b waar f(x) gelijk is aan c (zonder <code>= c</code>: waar f(x) nul is), <code>&#36;Sup{…}</code> en <code>&#36;Inf{…}</code> zoeken de grootste en de kleinste waarde. Ook dat kan met eenheden.</i>

M_d(x) = q_d*x*(L - x)/2 + F_d*min(x; L - x)/2', momentenlijn met de rekenwaarden'
#hide
L_grens = $Root{UC_L(x) = 1 @ x = 0.5 m : 100 m}
M_top = $Sup{M_d(x) @ x = 0 m : L}
#show
L_grens', met &#36;Root: grootste overspanning waarbij de buiging nog voldoet'
M_top', met &#36;Sup: grootste moment, gelijk aan M<sub>Ed</sub>'

## 10.3 Een parametrische kromme

'<i>Schrijf <code>x(t)&#124;y(t)</code> om beide coördinaten van een parameter te laten afhangen. Hieronder de interactiekromme van normaalkracht en moment voor een volledig plastische stalen strip van 12 × 150 mm, met de plaats z van de neutrale lijn als parameter; de tweede kromme is het gespiegelde deel voor een negatief moment.</i>

b_s = 12', breedte in mm'
h_s = 150', hoogte in mm'
f_ys = 235', vloeigrens in N/mm²'
N_s(z) = 2*b_s*z*f_ys/1000', normaalkracht in kN'
M_s(z) = b_s*(h_s^2/4 - z^2)*f_ys/10^6', moment in kNm'
$Plot{M_s(z)|N_s(z) & -M_s(z)|N_s(z) @ z = -h_s/2 : h_s/2}
'Horizontaal het moment M in kNm, verticaal de normaalkracht N in kN.

# 11. Parametrische tekeningen

'<h2>11.1 Een tekening met waarden: @svg<span class="alleen-scherm"></span></h2>

'<i>Tussen <code>@svg</code> en <code>@end</code> staat een gewone SVG-tekening. Op de plek van <code>&#123;&#123;naam&#125;&#125;</code> komt de waarde van een variabele, zonder eenheid; ook tekst, zoals een kleur. Alleen een naam past daar, geen formule: reken maten daarom eerst verborgen uit.</i>
#hide
uc_1 = 120 + 300/1.25
b_M = max(2; 300*min(UC_M; 1.25)/1.25)
b_V = max(2; 300*min(UC_V; 1.25)/1.25)
b_w = max(2; 300*min(UC_w; 1.25)/1.25)
k_M = kleur(UC_M)
k_V = kleur(UC_V)
k_w = kleur(UC_w)
t_M = round(UC_M; 2)
t_V = round(UC_V; 2)
t_W = round(UC_w; 2)
#show
@svg
<svg class="alleen-scherm" viewBox="0 0 480 130" style="width:100%; max-width:560px; font-size:12px;">
  <rect width="480" height="130" rx="6" style="fill:#fafaf9"/>
  <text x="112" y="31" text-anchor="end" style="fill:#334155">buiging</text>
  <rect x="120" y="18" width="{{b_M}}" height="18" rx="3" style="fill:{{k_M}}"/>
  <text x="430" y="31" style="fill:#334155; font-weight:700">{{t_M}}</text>
  <text x="112" y="63" text-anchor="end" style="fill:#334155">dwarskracht</text>
  <rect x="120" y="50" width="{{b_V}}" height="18" rx="3" style="fill:{{k_V}}"/>
  <text x="430" y="63" style="fill:#334155; font-weight:700">{{t_V}}</text>
  <text x="112" y="95" text-anchor="end" style="fill:#334155">doorbuiging</text>
  <rect x="120" y="82" width="{{b_w}}" height="18" rx="3" style="fill:{{k_w}}"/>
  <text x="430" y="95" style="fill:#334155; font-weight:700">{{t_W}}</text>
  <line x1="{{uc_1}}" y1="10" x2="{{uc_1}}" y2="108" style="stroke:#334155; stroke-dasharray:4 3"/>
  <text x="{{uc_1}}" y="122" text-anchor="middle" style="fill:#334155">UC = 1</text>
</svg>
@end

## 11.2 Een tekening op tekstregels

'<i>Meer vrijheid geeft een tekening op tekstregels: elke regel begint met een apostrof en is een stukje SVG, met formules tussen apostrofs, zoals <code>&lt;line x1="&#39;x_a + 10&#39;" …/&gt;</code>. Tussen die regels mogen <code>#for</code> en <code>#if</code> staan. Hieronder tekent een herhaling de pijlen van de verdeelde last (meer pijlen bij een langere ligger) en verschijnt de puntlast alleen als die is meegenomen. Verander de overspanning, het profiel of de keuze voor de puntlast in hoofdstuk 3 en de tekening verandert mee.</i>
#hide
L_n = L/(1 m)
s_x = min(45; 380/L_n)
x_a = 240 - s_x*L_n/2
x_b = 240 + s_x*L_n/2
s_y = 104
n_pijl = max(4; round(2*L_n))
d_p = (x_b - x_a)/n_pijl
#show
'<svg viewBox="0 0 480 180" style="width:100%; max-width:560px; font-size:12px;">
'  <rect width="480" height="180" rx="6" style="fill:#fafaf9"/>
#for i = 0 : n_pijl
'  <line x1="'x_a + i*d_p'" y1="'s_y - 44'" x2="'x_a + i*d_p'" y2="'s_y - 13'" style="stroke:#475569; stroke-width:1.4"/>
'  <polygon points="'x_a + i*d_p','s_y - 4' 'x_a + i*d_p - 3.5','s_y - 13' 'x_a + i*d_p + 3.5','s_y - 13'" style="fill:#475569"/>
#loop
'  <line x1="'x_a'" y1="'s_y - 44'" x2="'x_b'" y2="'s_y - 44'" style="stroke:#475569; stroke-width:2"/>
'  <text x="'x_a'" y="'s_y - 50'" style="fill:#475569; font-weight:700">q<tspan dy="3" font-size="9">d</tspan><tspan dy="-3"> = 'q_d' kN/m</tspan></text>
#if met_F ≡ 1
'  <line x1="240" y1="'s_y - 88'" x2="240" y2="'s_y - 15'" style="stroke:#fafaf9; stroke-width:6"/>
'  <line x1="240" y1="'s_y - 88'" x2="240" y2="'s_y - 15'" style="stroke:#b91c1c; stroke-width:2.6"/>
'  <polygon points="240,'s_y - 3' 234,'s_y - 17' 246,'s_y - 17'" style="fill:#b91c1c"/>
'  <text x="248" y="'s_y - 76'" style="fill:#b91c1c; font-weight:700">F<tspan dy="3" font-size="9">d</tspan><tspan dy="-3"> = 'F_d' kN</tspan></text>
#end if
'  <rect x="'x_a'" y="'s_y - 3'" width="'x_b - x_a'" height="6" style="fill:#94a3b8; stroke:#334155"/>
steunpunt$(x_a; s_y + 3)
steunpunt$(x_b; s_y + 3)
'  <line x1="'x_a'" y1="'s_y + 40'" x2="'x_b'" y2="'s_y + 40'" style="stroke:#1e40af"/>
'  <line x1="'x_a'" y1="'s_y + 34'" x2="'x_a'" y2="'s_y + 46'" style="stroke:#1e40af"/>
'  <line x1="'x_b'" y1="'s_y + 34'" x2="'x_b'" y2="'s_y + 46'" style="stroke:#1e40af"/>
'  <text x="240" y="'s_y + 60'" text-anchor="middle" style="fill:#1e40af; font-weight:700">L = 'L' m · IPE 'h_p' · S'staal'</text>
'</svg>

## 11.3 Kopplaat met bouten (EN 1993-1-8)

'<i>Een tekening die door invoer en keuzes wordt gestuurd: de maten van de kopplaat volgen uit het profiel, het aantal boutrijen en de boutmaat kies je hieronder, en de randafstand e<sub>1</sub> bepaalt waar de bouten komen. Het profiel zelf tekent <code>doorsnede_svg(D; 1; x0; y0; schaal)</code>.</i>

@select n_r "Aantal boutrijen"
  2 rijen = 2
  3 rijen = 3
  4 rijen = 4
@end
@select bout "Bouten, klasse 8.8"
  M16 = 16
  M20 = 20
  M24 = 24
@end
e_1 = ?{65}*(mm)', bovenrand tot bovenste boutrij<span class="alleen-scherm"></span>'
#hide
bouten = [16; 20; 24 | 157; 245; 353]
#show
e_1', afstand van de bovenrand tot de bovenste boutrij'
h_pl = h_p + 40 mm', hoogte kopplaat'
b_pl = b_p + 20 mm', breedte kopplaat'
d_0 = (bout + 2)*mm', gatdiameter'
e_2 = 30 mm', randafstand tot de buitenste boutkolom'
p_1 = (h_pl - 2*e_1)/(n_r - 1)', steek tussen de boutrijen'
p_2 = b_pl - 2*e_2', afstand tussen de boutkolommen'
#if and(e_1 ≥ 1.2*d_0; e_2 ≥ 1.2*d_0; p_1 ≥ 2.2*d_0; p_2 ≥ 2.4*d_0)
  'Rand- en tussenafstanden voldoen aan de minima van tabel 3.3 (e ≥ 1,2·d<sub>0</sub>, p<sub>1</sub> ≥ 2,2·d<sub>0</sub>, p<sub>2</sub> ≥ 2,4·d<sub>0</sub>).
#else
  '<b style="color:#b91c1c">Een rand- of tussenafstand is kleiner dan het minimum van tabel 3.3.</b>
#end if
A_s,b = hlookup(bouten; bout; 1; 2)*mm^2', spanningsdoorsnede uit de verborgen tabel [M; A<sub>s</sub>]'
f_ub = 800 N/mm^2', boutklasse 8.8'
α_v = 0.6
γ_M2 = 1.25', NB'
F_v,Rd = α_v*f_ub*A_s,b/γ_M2 to kN', tabel 3.4, schuifvlak door het draadgedeelte'
F_v,Ed = V_Ed/(2*n_r) to kN', dwarskracht gelijk verdeeld over alle bouten'
UC_b = F_v,Ed/F_v,Rd
#hide
s_k = min(230/(h_pl/(1 mm)); 1.6)
k_x = 190
k_y = 140
hpl_n = h_pl/(1 mm)
bpl_n = b_pl/(1 mm)
k_top = k_y - s_k*hpl_n/2
k_lnk = k_x - s_k*bpl_n/2
r_b = s_k*(d_0/(1 mm))/2
x_d = k_x + s_k*bpl_n/2 + 24
#show
'<svg viewBox="0 0 480 280" style="width:100%; max-width:560px; font-size:12px;">
'  <rect width="480" height="280" rx="6" style="fill:#fafaf9"/>
'  <rect x="'k_lnk'" y="'k_top'" width="'s_k*bpl_n'" height="'s_k*hpl_n'" style="fill:#e2e8f0; stroke:#334155; stroke-width:1.2"/>
'  <polygon points="'doorsnede_svg(D; 1; k_x; k_y; s_k)'" style="fill:#94a3b8; fill-opacity:0.55; stroke:#334155; stroke-width:1"/>
#for i = 1 : n_r
'  <circle cx="'k_x - s_k*(p_2/(1 mm))/2'" cy="'k_top + s_k*(e_1 + (i - 1)*p_1)/(1 mm)'" r="'r_b'" style="fill:#fafaf9; stroke:#1e293b; stroke-width:1.4"/>
'  <circle cx="'k_x + s_k*(p_2/(1 mm))/2'" cy="'k_top + s_k*(e_1 + (i - 1)*p_1)/(1 mm)'" r="'r_b'" style="fill:#fafaf9; stroke:#1e293b; stroke-width:1.4"/>
#loop
'  <line x1="'x_d'" y1="'k_top'" x2="'x_d'" y2="'k_top + s_k*(e_1 + p_1)/(1 mm)'" style="stroke:#1e40af"/>
'  <line x1="'x_d - 5'" y1="'k_top'" x2="'x_d + 5'" y2="'k_top'" style="stroke:#1e40af"/>
'  <line x1="'x_d - 5'" y1="'k_top + s_k*e_1/(1 mm)'" x2="'x_d + 5'" y2="'k_top + s_k*e_1/(1 mm)'" style="stroke:#1e40af"/>
'  <line x1="'x_d - 5'" y1="'k_top + s_k*(e_1 + p_1)/(1 mm)'" x2="'x_d + 5'" y2="'k_top + s_k*(e_1 + p_1)/(1 mm)'" style="stroke:#1e40af"/>
'  <text x="'x_d + 9'" y="'k_top + s_k*e_1/(2 mm) + 4'" style="fill:#1e40af; font-weight:700">e<tspan dy="3" font-size="9">1</tspan><tspan dy="-3"> = 'e_1' mm</tspan></text>
'  <text x="'x_d + 9'" y="'k_top + s_k*(e_1 + p_1/2)/(1 mm) + 4'" style="fill:#1e40af; font-weight:700">p<tspan dy="3" font-size="9">1</tspan><tspan dy="-3"> = 'round(p_1/(1 mm); 1)' mm</tspan></text>
'  <text x="'k_x'" y="'k_top + s_k*hpl_n + 22'" text-anchor="middle" style="fill:#334155">kopplaat 'h_pl' × 'b_pl' mm · IPE 'h_p' · 'n_r' × 2 bouten M'bout'</text>
'</svg>
'Bouten op afschuiving: <b style="color:'kleur(UC_b)'">UC = 'round(UC_b; 2)', 'oordeel(UC_b)'</b>

# 12. Een afbeelding: @img

'<i>Met <code>@img(bestand)</code> voeg je een afbeelding in. Een SVG-tekening die met de app is meegeleverd, komt als tekening in het blad; dit detail is er zo een. Een afbeelding is vast: anders dan de tekeningen van hoofdstuk 11 rekent er niets in mee.</i>
@img(detail-oplegging.svg)

# 13. Een ruimtelijk beeld: @3d

'<i>Tussen <code>@3d</code> en <code>@end</code> beschrijf je een ruimtelijk beeld, één element per regel: eerst wat het is, dan de maten. x en y liggen horizontaal, z wijst omhoog. <code>ibalk x1 y1 z1 x2 y2 z2 b h tw tf</code> is een I-profiel van punt 1 naar punt 2, <code>balk … b h</code> een rechthoekige balk, <code>kolom x y z0 z1 b h</code> een staande balk, <code>plaat x y z lx ly t</code> een plaat of poer, <code>lijnlast x1 y1 z1 x2 y2 z2 a</code> een rij pijlen van lengte a, <code>pijl x1 y1 z1 x2 y2 z2</code> een puntlast en <code>tekst x y z "…"</code> een label. Er zijn ook <code>buis</code>, <code>doos</code>, <code>staaf</code>, <code>knoop</code> en <code>oplegging</code>.</i>
'<i>Een maat is een getal of een formule tussen dubbele accolades: <code>&#123;&#123;L&#125;&#125;</code>, <code>&#123;&#123;H_k + h_p/2&#125;&#125;</code>. Een lengte telt daarin in millimeters (na de regel <code>eenheid m</code> in meters): met L = 5 m geeft <code>&#123;&#123;L/2&#125;&#125;</code> dus 2500. In een tekst komt de waarde zonder eenheid. Achteraan een regel mag een kleur staan, zoals <code>staal</code>, <code>hout</code>, <code>beton</code> of <code>#rrggbb</code>; zonder kleur is een balk staal, een plaat beton en een last amber. <code>#for</code> en <code>#if</code> werken ook in het blok, en <code>camera voor</code>, <code>hoogte 400</code> of <code>raster uit</code> stellen het beeld in.</i>
'<i>Hieronder de ligger van dit blad: het gekozen profiel over de overspanning L op twee kolommen van hetzelfde profiel, met de verdeelde last (de pijlen zijn langer bij een grotere last) en, als die is meegenomen, de puntlast in het midden. Verander het profiel, L of de puntlast in hoofdstuk 3 en het beeld verandert mee. In de uitwerking draai je het beeld door te slepen, schuif je met de rechtermuisknop en zoom je na een klik met het wiel; de knoppen rechtsboven zetten het op een vast standpunt. Op papier staat een stilstaande afbeelding.</i>
#hide
H_k = 3 m
#show
@3d
camera iso
hoogte 340
// poeren en kolommen (het profiel staat met zijn lijf in het vlak van het portaal)
plaat -400 -400 -500 800 800 500
plaat {{L - 400}} -400 -500 800 800 500
ibalk 0 0 0 0 0 {{H_k}} {{b_p}} {{h_p}} {{t_w}} {{t_f}}
ibalk {{L}} 0 0 {{L}} 0 {{H_k}} {{b_p}} {{h_p}} {{t_w}} {{t_f}}
// de ligger ligt op de kolommen
ibalk {{-h_p/2}} 0 {{H_k + h_p/2}} {{L + h_p/2}} 0 {{H_k + h_p/2}} {{b_p}} {{h_p}} {{t_w}} {{t_f}}
// verdeelde last: 100 mm pijl per kN/m
lijnlast 0 0 {{H_k + h_p}} {{L}} 0 {{H_k + h_p}} {{(g_k + q_k)/(1 kN/m)*100}}
#if met_F ≡ 1
pijl {{L/2}} 0 {{H_k + h_p + 1400}} {{L/2}} 0 {{H_k + h_p}}
tekst {{L/2}} 0 {{H_k + h_p + 1450}} "F = {{F_k}} kN"
#end if
tekst {{L + 250}} 0 {{H_k + h_p}} "IPE {{h_p}}"
tekst {{L/2}} 0 -500 "L = {{L}} m"
@end

# 14. Een externe pagina: @iframe

'<i>Met <code>@iframe adres hoogte=60mm</code> zet je een externe pagina op de bladbreedte, in de uitwerking en op papier. Een blad kan van iemand anders komen: de pagina laadt pas na een klik op de knop, en alleen van http of https. Tot dan staat er een kader met het adres; dat komt ook op papier als de pagina niet geladen is. Met <code>scripts</code> achter het adres mag de pagina scripts uitvoeren, afgeschermd van de app. In het adres werkt <code>&#123;&#123;L&#125;&#125;</code> ook.</i>
@iframe https://www.example.com/?L={{L}} hoogte=45mm titel="Voorbeeldpagina"

# 15. JavaScript: @js

'<i>Tussen <code>@js</code> en <code>@end</code> staat gewoon JavaScript. Het loopt pas na een klik op de knop, in een eigen afgeschermd venster: zonder netwerk en zonder toegang tot de app of je bestanden. De waarden van dit blad staan klaar als <code>calc</code>, met hun eenheid. <code>calc.getallen("mm")</code> geeft alles wat een lengte is in millimeters. Met <code>bibliotheek=three</code> is three.js er ook, en maakt <code>calc.wereld3d()</code> een draaibaar beeld. <code>calc.bijWijziging</code> tekent opnieuw als een waarde verandert: de camera blijft dan staan. Pas L, b of h aan en de balk beweegt mee.</i>
@js hoogte=85mm titel="Balk in 3D" bibliotheek=three
const w = calc.wereld3d({ richting: [0.55, -1.5, 0.6] });

function teken() {
  const { L, b, h } = calc.getallen("mm");
  const a = 300;                    // oplegging in de lengte van de balk
  const s = Math.max(2 * b, 400);   // en dwars erop
  w.leeg();
  w.doos([-a / 2, -b / 2, 0], [L + a / 2, b / 2, h], "#e3c08a");
  w.doos([-a / 2, -s / 2, -450], [a / 2, s / 2, 0], "#c9c5bd");
  w.doos([L - a / 2, -s / 2, -450], [L + a / 2, s / 2, 0], "#c9c5bd");

  // Een verdeelde last, en de maten als tekst bij het model.
  const n = Math.max(4, Math.round(L / 600));
  for (let i = 0; i <= n; i++) {
    w.pijl([(i * L) / n, 0, h + 650], [(i * L) / n, 0, h + 30], "#d97706");
  }
  const t = Math.max(L * 0.045, 120);
  w.label("L = " + L + " mm", [L / 2, 0, h + 650 + t], t);
  w.label(b + " × " + h + " mm", [L / 2, 0, -t], t * 0.8);
  w.teken();
}

teken();
calc.bijWijziging(teken);
@end

'<h1>16. Spiekbriefje<span class="alleen-scherm"></span></h1>
'<i>De schrijfwijzen van dit blad op een rij.</i>
'<table class="alleen-scherm" style="border-collapse:collapse; font-size:0.88em; line-height:1.35;">
'<tr style="border-bottom:1.5px solid #6b7280;"><th style="padding:2px 10px; text-align:left;">Schrijfwijze</th><th style="padding:2px 10px; text-align:left;">Betekenis</th></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>"Titel</code></td><td style="padding:1px 10px;">titel van het blad</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code># Kop</code>, <code>## Kop</code></td><td style="padding:1px 10px;">hoofdstuk, paragraaf</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>&#39;tekst</code></td><td style="padding:1px 10px;">tekstregel, HTML mag; <code>&#39;formule&#39;</code> zet er een waarde in</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>// …</code></td><td style="padding:1px 10px;">commentaar, alleen in de editor</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>x = 5 mm&#39;, toelichting&#39;</code></td><td style="padding:1px 10px;">toekenning met eenheid en toelichting</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>… to kN*m</code>, <code>… &#124;kN*m</code></td><td style="padding:1px 10px;">omrekenen naar een eenheid</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>F = ?{10}*(kN)</code></td><td style="padding:1px 10px;">invoerveld met standaardwaarde</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>@select naam "…"</code> … <code>@end</code></td><td style="padding:1px 10px;">keuzelijst, per regel <code>tekst = getal</code></td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>f(x; y) = …</code></td><td style="padding:1px 10px;">eigen functie</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>#if</code> … <code>#else if</code> … <code>#else</code> … <code>#end if</code></td><td style="padding:1px 10px;">voorwaarde</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>#for i = 1 : n</code> … <code>#loop</code></td><td style="padding:1px 10px;">herhaling met een teller</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>#repeat n</code> … <code>#loop</code>, <code>#while …</code> … <code>#loop</code></td><td style="padding:1px 10px;">n keer herhalen (teller <code>_i</code>), of zolang een voorwaarde geldt</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>#break</code></td><td style="padding:1px 10px;">een herhaling stoppen</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>#hide</code> … <code>#show</code></td><td style="padding:1px 10px;">rekenen zonder te tonen</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>#def naam&#36;(a&#36;; b&#36;)</code> … <code>#end def</code></td><td style="padding:1px 10px;">macro met parameters</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>[a; b &#124; c; d]</code>, <code>v.1</code>, <code>M.(i; j) = …</code>, <code>matrix(m; n)</code></td><td style="padding:1px 10px;">matrix (rijen gescheiden door &#124;), element lezen of toekennen, nulmatrix</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>hlookup(M; w; i; j)</code></td><td style="padding:1px 10px;">opzoeken in een tabel</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>lsolve(K; F)</code>, <code>inverse(K)</code>, <code>det(K)</code>, <code>transp(K)</code></td><td style="padding:1px 10px;">stelsel oplossen, inverse, determinant, getransponeerde</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>&#36;Plot{f(x) @ x = a : b}</code></td><td style="padding:1px 10px;">grafiek; meer lijnen met &amp;, kromme met x(t)&#124;y(t), maat met PlotWidth en PlotHeight</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>&#36;Root{f(x) = c @ …}</code>, <code>&#36;Sup{…}</code>, <code>&#36;Inf{…}</code></td><td style="padding:1px 10px;">oplossen, maximum, minimum</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>@svg</code> … <code>@end</code> met <code>&#123;&#123;naam&#125;&#125;</code></td><td style="padding:1px 10px;">tekening met waarden</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>&#39;&lt;svg …&gt;</code> met <code>&#39;formule&#39;</code></td><td style="padding:1px 10px;">parametrische tekening op tekstregels</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>@img(bestand.svg)</code></td><td style="padding:1px 10px;">afbeelding</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>@iframe adres hoogte=60mm</code></td><td style="padding:1px 10px;">externe pagina, laadt pas na bevestiging</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>@js</code> … <code>@end</code></td><td style="padding:1px 10px;">JavaScript met de waarden van het blad als <code>calc</code>, afgeschermd, na bevestiging</td></tr>
'<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:1px 10px;"><code>ligger(…)</code>, <code>doorsnede(…)</code></td><td style="padding:1px 10px;">constructieve rekenfuncties van de rekenkern</td></tr>
'</table>
`;
