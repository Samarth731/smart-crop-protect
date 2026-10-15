/**
 * Crop threat knowledge base: recognition, favourable conditions and integrated management.
 * Compiled from ICAR / state agricultural university package-of-practice recommendations and
 * the TNAU Agritech portal. Chemical options name active ingredients only: users must follow
 * the product label (dose, waiting period) and local extension advice.
 */
import type { CropId, Lang } from "./crops";

export type ThreatKind = "fungal" | "bacterial" | "viral" | "insect" | "mite" | "abiotic";
export type Symptom =
  | "spots"
  | "eye-lesions"
  | "concentric-rings"
  | "rust-pustules"
  | "powder"
  | "water-soaked"
  | "leaf-tip-dry"
  | "yellowing"
  | "mosaic"
  | "leaf-curl"
  | "wilting"
  | "stunting"
  | "holes"
  | "frass"
  | "bored-fruit"
  | "dead-heart"
  | "sticky-insects"
  | "webbing"
  | "silvering"
  | "rotting-stem"
  | "dry-cracked"
  | "standing-water"
  | "lodged"
  | "weeds"
  | "mouldy-grain"
  | "trampled"
  | "purple-patches"
  | "white-mould-under";

export type L4 = Record<Lang, string>;

export interface Threat {
  id: string;
  kind: ThreatKind;
  crops: CropId[] | "all";
  name: L4;
  /** one-line action shown on alerts and diagnosis results */
  act: L4;
  signs: string;
  favours: string;
  manage: { cultural: string[]; biological?: string[]; chemical?: string[] };
  /** P(symptom is reported | this threat); unlisted symptoms use a small background rate */
  symptoms: Partial<Record<Symptom, number>>;
  /** base rate among field problems (relative) */
  prior: number;
}

const T = (t: Threat) => t;

export const THREATS: Threat[] = [
  // ---------------- Rice ----------------
  T({
    id: "rice-blast",
    kind: "fungal",
    crops: ["rice"],
    name: {
      en: "Rice blast",
      hi: "धान का ब्लास्ट (झोंका) रोग",
      gu: "ડાંગરનો કરમોડી (બ્લાસ્ટ)",
      mr: "भातावरील करपा (ब्लास्ट)",
    },
    act: {
      en: "Avoid extra urea now; spray a recommended fungicide (e.g. tricyclazole) at first eye-shaped spots.",
      hi: "अभी यूरिया न डालें; आंख जैसे धब्बे दिखते ही अनुशंसित फफूंदनाशी (जैसे ट्राइसाइक्लाज़ोल) छिड़कें।",
      gu: "હમણાં વધારાનો યુરિયા ન આપો; આંખ જેવા ટપકાં દેખાય કે તરત ભલામણ કરેલ ફૂગનાશક (જેમ કે ટ્રાયસાયક્લાઝોલ) છાંટો.",
      mr: "आता जादा युरिया टाळा; डोळ्याच्या आकाराचे ठिपके दिसताच शिफारस केलेले बुरशीनाशक (उदा. ट्रायसायक्लाझोल) फवारा.",
    },
    signs:
      "Spindle- or eye-shaped spots with grey centres and brown margins on leaves; neck turns black and panicles break (neck blast).",
    favours:
      "Long leaf wetness (10 h or more), night temperatures 20-26 °C, cloudy humid weather, heavy nitrogen.",
    manage: {
      cultural: [
        "Grow resistant varieties recommended for your district",
        "Split nitrogen into 3 doses; avoid excess urea",
        "Remove grassy weeds on bunds that host the fungus",
      ],
      biological: ["Seed treatment and spray with Pseudomonas fluorescens"],
      chemical: ["Tricyclazole, azoxystrobin or isoprothiolane at first symptoms and at panicle emergence"],
    },
    symptoms: { "eye-lesions": 0.85, spots: 0.6, "leaf-tip-dry": 0.15, "rotting-stem": 0.2 },
    prior: 1.2,
  }),
  T({
    id: "rice-blb",
    kind: "bacterial",
    crops: ["rice"],
    name: {
      en: "Bacterial leaf blight",
      hi: "जीवाणु पत्ती झुलसा (BLB)",
      gu: "જીવાણુથી થતો પાનનો સુકારો",
      mr: "जिवाणूजन्य करपा (BLB)",
    },
    act: {
      en: "Drain the field briefly, stop nitrogen top-dressing and avoid flooding from infected fields.",
      hi: "खेत से कुछ समय पानी निकालें, नाइट्रोजन देना रोकें और रोगी खेत का पानी न आने दें।",
      gu: "ખેતરમાંથી થોડા સમય પાણી કાઢો, નાઈટ્રોજન આપવાનું બંધ કરો અને રોગિષ્ઠ ખેતરનું પાણી આવવા ન દો.",
      mr: "शेतातून काही काळ पाणी काढा, नत्र देणे थांबवा आणि रोगट शेतातील पाणी येऊ देऊ नका.",
    },
    signs:
      "Wavy yellow-to-straw stripes from the leaf tip down the margins; milky bacterial ooze in the morning.",
    favours: "Storms and strong winds that wound leaves, flooding, 25-34 °C, high humidity, heavy nitrogen.",
    manage: {
      cultural: [
        "Use resistant varieties (e.g. those carrying Xa21/xa13 genes)",
        "Balanced fertiliser with potash; avoid late nitrogen",
        "Keep bunds and channels clean; do not let water flow from infected plots",
      ],
      chemical: ["Copper oxychloride sprays can slow spread; antibiotics only as permitted by label"],
    },
    symptoms: { "leaf-tip-dry": 0.85, yellowing: 0.5, "water-soaked": 0.4, wilting: 0.2 },
    prior: 1,
  }),
  T({
    id: "rice-brown-spot",
    kind: "fungal",
    crops: ["rice"],
    name: { en: "Brown spot", hi: "भूरा धब्बा रोग", gu: "બદામી ટપકાંનો રોગ", mr: "तपकिरी ठिपके" },
    act: {
      en: "Correct nutrient deficiency (potash, zinc) and spray mancozeb or propiconazole if spots spread.",
      hi: "पोटाश व जिंक की कमी दूर करें; धब्बे बढ़ें तो मैंकोज़ेब या प्रोपिकोनाज़ोल छिड़कें।",
      gu: "પોટાશ અને ઝીંકની ઉણપ દૂર કરો; ટપકાં વધે તો મેન્કોઝેબ અથવા પ્રોપીકોનાઝોલ છાંટો.",
      mr: "पोटॅश व झिंकची कमतरता दूर करा; ठिपके वाढल्यास मॅन्कोझेब किंवा प्रोपिकोनाझोल फवारा.",
    },
    signs: "Oval brown spots with a grey centre and yellow halo, often many per leaf; discoloured grains.",
    favours: "Nutrient-poor or drought-stressed soils, 25-30 °C with long leaf wetness.",
    manage: {
      cultural: ["Soil test and balanced NPK with zinc", "Use healthy, treated seed"],
      chemical: ["Seed treatment with carbendazim or thiram; foliar mancozeb or propiconazole"],
    },
    symptoms: { spots: 0.8, "eye-lesions": 0.2, yellowing: 0.3, "mouldy-grain": 0.2 },
    prior: 0.9,
  }),
  T({
    id: "rice-sheath-blight",
    kind: "fungal",
    crops: ["rice"],
    name: { en: "Sheath blight", hi: "शीथ झुलसा", gu: "પર્ણચ્છેદનો સુકારો", mr: "आवरण करपा" },
    act: {
      en: "Thin dense patches, avoid excess nitrogen and spray validamycin or hexaconazole on the lower canopy.",
      hi: "घने हिस्से छांटें, अधिक नाइट्रोजन न दें, निचले हिस्से पर वैलिडामाइसिन या हेक्साकोनाज़ोल छिड़कें।",
      gu: "ગીચ ભાગ પાતળો કરો, વધારે નાઈટ્રોજન ન આપો, નીચેના ભાગે વેલિડામાયસીન અથવા હેક્ઝાકોનાઝોલ છાંટો.",
      mr: "दाट भाग विरळ करा, जास्त नत्र टाळा, खालच्या भागावर व्हॅलिडामायसिन किंवा हेक्साकोनाझोल फवारा.",
    },
    signs:
      "Oval grey-green lesions with brown borders on the leaf sheath near the water line, spreading upwards.",
    favours: "Dense canopy, 28-32 °C and humidity above 85 % for long periods, high nitrogen.",
    manage: {
      cultural: ["Optimum spacing", "Remove weeds and stubble that carry sclerotia", "Balanced nitrogen"],
      biological: ["Trichoderma or Pseudomonas soil application"],
      chemical: ["Validamycin, hexaconazole or azoxystrobin directed at the base"],
    },
    symptoms: { "rotting-stem": 0.6, spots: 0.5, "eye-lesions": 0.2, lodged: 0.2 },
    prior: 0.8,
  }),
  T({
    id: "rice-tungro",
    kind: "viral",
    crops: ["rice"],
    name: { en: "Rice tungro virus", hi: "टुंग्रो विषाणु रोग", gu: "ટુંગ્રો વાયરસ", mr: "टुंग्रो विषाणू रोग" },
    act: {
      en: "Rogue out infected hills and control green leafhoppers early; there is no cure once infected.",
      hi: "रोगी पौधे उखाड़ें और हरे फुदके को जल्दी नियंत्रित करें; संक्रमण के बाद इलाज नहीं है।",
      gu: "રોગિષ્ઠ છોડ ઉખાડી નાખો અને લીલા તડતડિયાનું વહેલું નિયંત્રણ કરો; ચેપ પછી ઈલાજ નથી.",
      mr: "रोगट चुडे उपटून टाका व हिरवे तुडतुडे लवकर नियंत्रित करा; संसर्गानंतर उपचार नाही.",
    },
    signs: "Stunted plants with yellow-orange leaves starting from the tip, fewer tillers, patchy spread.",
    favours: "Green leafhopper populations, staggered planting, infected stubble nearby.",
    manage: {
      cultural: ["Resistant varieties", "Synchronous planting in the village", "Remove infected stubble"],
      chemical: ["Control the leafhopper vector in the nursery and early crop as per label"],
    },
    symptoms: { yellowing: 0.8, stunting: 0.8, "leaf-tip-dry": 0.2 },
    prior: 0.5,
  }),
  T({
    id: "rice-bph",
    kind: "insect",
    crops: ["rice"],
    name: { en: "Brown planthopper", hi: "भूरा फुदका (BPH)", gu: "બદામી ચૂસિયાં", mr: "तपकिरी तुडतुडे" },
    act: {
      en: "Check plant bases weekly; drain the field for 3-4 days and avoid synthetic pyrethroids that cause resurgence.",
      hi: "हर हफ्ते पौधों के तने का आधार देखें; 3-4 दिन पानी निकालें, पायरेथ्रॉइड न छिड़कें।",
      gu: "દર અઠવાડિયે છોડના થડ પાસે તપાસો; 3-4 દિવસ પાણી કાઢો, પાયરેથ્રોઈડ ન છાંટો.",
      mr: "दर आठवड्याला खोडाजवळ तपासा; 3-4 दिवस पाणी काढा, पायरेथ्रॉइड फवारू नका.",
    },
    signs:
      "Brown insects clustered at the base of tillers; circular patches of drying plants ('hopper burn').",
    favours: "Dense canopy, high nitrogen, 25-30 °C, humidity above 80 %, continuous flooding.",
    manage: {
      cultural: ["Alleyways every 2 m for aeration", "Alternate wetting and drying", "Balanced nitrogen"],
      chemical: ["Pymetrozine, dinotefuran or buprofezin at the base when above threshold (10 per hill)"],
    },
    symptoms: { "sticky-insects": 0.6, wilting: 0.5, yellowing: 0.4, "dry-cracked": 0.1 },
    prior: 0.8,
  }),
  T({
    id: "rice-stem-borer",
    kind: "insect",
    crops: ["rice"],
    name: { en: "Yellow stem borer", hi: "पीला तना छेदक", gu: "ગાભમારાની ઇયળ", mr: "पिवळा खोडकिडा" },
    act: {
      en: "Pull out dead hearts, install pheromone traps (5 per acre) and release Trichogramma egg parasitoids.",
      hi: "सूखी गोभ निकालें, फेरोमोन ट्रैप (5 प्रति एकड़) लगाएं, ट्राइकोग्रामा छोड़ें।",
      gu: "સુકાયેલા પીલા કાઢો, ફેરોમોન ટ્રેપ (એકરે 5) લગાવો, ટ્રાઈકોગ્રામા છોડો.",
      mr: "सुकलेले गाभे काढा, कामगंध सापळे (एकरी 5) लावा, ट्रायकोग्रामा सोडा.",
    },
    signs: "Central shoot dries ('dead heart') in young plants; white empty panicles ('white ear') later.",
    favours: "Continuous rice cropping, stubble left in field, warm humid weather.",
    manage: {
      cultural: ["Clip seedling tips before transplanting", "Plough in stubble after harvest"],
      biological: ["Trichogramma japonicum releases", "Pheromone mass trapping"],
      chemical: ["Chlorantraniliprole or cartap granules as per label"],
    },
    symptoms: { "dead-heart": 0.9, holes: 0.2, wilting: 0.3 },
    prior: 1,
  }),
  T({
    id: "rice-leaf-scald",
    kind: "fungal",
    crops: ["rice"],
    name: {
      en: "Leaf scald",
      hi: "पत्ती झुलसा (लीफ स्काल्ड)",
      gu: "પાનનો દાહ (લીફ સ્કાલ્ડ)",
      mr: "पान करपा (लीफ स्काल्ड)",
    },
    act: {
      en: "Avoid excess nitrogen and spray a recommended fungicide (e.g. propiconazole) if banded lesions spread.",
      hi: "अधिक नाइट्रोजन न दें; पट्टीदार धब्बे फैलें तो अनुशंसित फफूंदनाशी (जैसे प्रोपिकोनाज़ोल) छिड़कें।",
      gu: "વધારે નાઈટ્રોજન ન આપો; પટ્ટાવાળા ડાઘ ફેલાય તો ભલામણ કરેલ ફૂગનાશક (જેમ કે પ્રોપીકોનાઝોલ) છાંટો.",
      mr: "जास्त नत्र टाळा; पट्टेदार डाग पसरल्यास शिफारस केलेले बुरशीनाशक (उदा. प्रोपिकोनाझोल) फवारा.",
    },
    signs:
      "Zoned, wavy-banded lesions starting at leaf tips or edges, light brown with darker bands; tips look scalded.",
    favours: "Wet weather, dense crops and high nitrogen during late tillering and booting.",
    manage: {
      cultural: ["Balanced nitrogen", "Wider spacing in wet seasons", "Clean seed"],
      chemical: ["Propiconazole or carbendazim + mancozeb as per label"],
    },
    symptoms: { "leaf-tip-dry": 0.7, spots: 0.5, "concentric-rings": 0.3 },
    prior: 0.4,
  }),
  // ---------------- Wheat ----------------
  T({
    id: "wheat-yellow-rust",
    kind: "fungal",
    crops: ["wheat"],
    name: { en: "Yellow (stripe) rust", hi: "पीला रतुआ", gu: "પીળો ગેરુ", mr: "पिवळा तांबेरा" },
    act: {
      en: "Scout every week in cool foggy spells; spray propiconazole or tebuconazole at first yellow stripes.",
      hi: "ठंडे कोहरे वाले दिनों में हर हफ्ते देखें; पहली पीली धारियां दिखते ही प्रोपिकोनाज़ोल छिड़कें।",
      gu: "ઠંડા ધુમ્મસવાળા દિવસોમાં દર અઠવાડિયે તપાસો; પીળી પટ્ટીઓ દેખાય કે પ્રોપીકોનાઝોલ છાંટો.",
      mr: "थंड धुक्याच्या काळात दर आठवड्याला पाहा; पिवळ्या रेषा दिसताच प्रोपिकोनाझोल फवारा.",
    },
    signs: "Bright yellow powdery pustules in stripes along leaf veins; powder rubs off on fingers.",
    favours: "Cool 10-15 °C, dew or light rain, foggy mornings; mainly north-western plains and hills.",
    manage: {
      cultural: ["Sow resistant varieties released for your zone", "Avoid late sowing"],
      chemical: ["Propiconazole or tebuconazole; repeat after 15 days if needed"],
    },
    symptoms: { "rust-pustules": 0.9, yellowing: 0.5, powder: 0.4 },
    prior: 1,
  }),
  T({
    id: "wheat-brown-rust",
    kind: "fungal",
    crops: ["wheat"],
    name: { en: "Brown (leaf) rust", hi: "भूरा रतुआ", gu: "બદામી ગેરુ", mr: "तपकिरी तांबेरा" },
    act: {
      en: "Spray a triazole fungicide when pustules appear on the upper leaves before grain filling.",
      hi: "दाना भरने से पहले ऊपरी पत्तियों पर फफोले दिखें तो ट्राइएज़ोल फफूंदनाशी छिड़कें।",
      gu: "દાણા ભરાતા પહેલા ઉપરના પાન પર ફોલ્લા દેખાય તો ટ્રાયઝોલ ફૂગનાશક છાંટો.",
      mr: "दाणे भरण्यापूर्वी वरच्या पानांवर पुटकुळ्या दिसल्यास ट्रायझोल बुरशीनाशक फवारा.",
    },
    signs: "Scattered round orange-brown pustules on leaves, not in stripes.",
    favours: "15-25 °C with at least 6 hours of leaf wetness.",
    manage: {
      cultural: ["Resistant varieties", "Timely sowing"],
      chemical: ["Propiconazole or tebuconazole"],
    },
    symptoms: { "rust-pustules": 0.9, spots: 0.3, powder: 0.3 },
    prior: 0.9,
  }),
  T({
    id: "aphid",
    kind: "insect",
    crops: ["wheat", "mustard", "potato", "chickpea"],
    name: { en: "Aphids", hi: "माहू (चेपा)", gu: "મોલો (મોલોમશી)", mr: "मावा" },
    act: {
      en: "Check 10 plants per spot; spray neem oil or a recommended systemic insecticide only above the threshold.",
      hi: "हर जगह 10 पौधे देखें; सीमा से ऊपर हो तभी नीम तेल या अनुशंसित दवा छिड़कें।",
      gu: "દરેક જગ્યાએ 10 છોડ તપાસો; મર્યાદાથી વધુ હોય તો જ લીમડાનું તેલ અથવા ભલામણ કરેલ દવા છાંટો.",
      mr: "प्रत्येक ठिकाणी 10 झाडे पाहा; मर्यादेपेक्षा जास्त असल्यासच निंबोळी तेल किंवा शिफारस केलेले कीटकनाशक फवारा.",
    },
    signs:
      "Colonies of small soft green/black insects on tender shoots and undersides; sticky honeydew, curled leaves.",
    favours: "Cool cloudy weather (10-20 °C), excess nitrogen; peaks December-February.",
    manage: {
      cultural: ["Timely sowing", "Avoid excess nitrogen", "Conserve ladybird beetles"],
      biological: ["Neem seed kernel extract 5 %", "Verticillium lecanii"],
      chemical: ["Imidacloprid, thiamethoxam or dimethoate only above the economic threshold"],
    },
    symptoms: { "sticky-insects": 0.9, "leaf-curl": 0.4, yellowing: 0.3, stunting: 0.2 },
    prior: 1.1,
  }),
  // ---------------- Maize ----------------
  T({
    id: "maize-faw",
    kind: "insect",
    crops: ["maize", "jowar", "bajra"],
    name: {
      en: "Fall armyworm",
      hi: "फॉल आर्मीवर्म",
      gu: "લશ્કરી ઇયળ (ફોલ આર્મીવર્મ)",
      mr: "लष्करी अळी (फॉल आर्मीवर्म)",
    },
    act: {
      en: "Check whorls twice a week; put sand + lime in whorls and spray emamectin benzoate or spinetoram if 10 % plants are hit.",
      hi: "हफ्ते में दो बार गोभ देखें; गोभ में रेत+चूना डालें; 10% पौधे प्रभावित हों तो इमामेक्टिन बेंजोएट छिड़कें।",
      gu: "અઠવાડિયે બે વાર ભૂંગળી તપાસો; રેતી+ચૂનો નાખો; 10% છોડ પર અસર હોય તો ઇમામેક્ટિન બેન્ઝોએટ છાંટો.",
      mr: "आठवड्यातून दोनदा पोंगा तपासा; पोंग्यात वाळू+चुना टाका; 10% झाडांवर प्रादुर्भाव असल्यास इमामेक्टिन बेंझोएट फवारा.",
    },
    signs:
      "Ragged holes and window-panes on young leaves, wet sawdust-like frass in the whorl; larvae with an inverted 'Y' on the head.",
    favours: "Warm weather 25-30 °C, dry spells, early whorl stage; spreads fast between fields.",
    manage: {
      cultural: ["Timely, synchronous sowing", "Intercrop with pulses", "Hand-pick egg masses"],
      biological: ["Bacillus thuringiensis or Metarhizium anisopliae sprays", "Pheromone traps 5 per acre"],
      chemical: ["Emamectin benzoate, spinetoram or chlorantraniliprole into the whorl"],
    },
    symptoms: { holes: 0.9, frass: 0.85, "dead-heart": 0.2 },
    prior: 1.4,
  }),
  T({
    id: "maize-nlb",
    kind: "fungal",
    crops: ["maize"],
    name: {
      en: "Turcicum (northern) leaf blight",
      hi: "टर्सिकम पत्ती झुलसा",
      gu: "ટર્સિકમ પાનનો સુકારો",
      mr: "टर्सिकम पान करपा",
    },
    act: {
      en: "Spray mancozeb or azoxystrobin + difenoconazole when long grey lesions reach the third leaf below the cob.",
      hi: "भुट्टे के नीचे तीसरी पत्ती तक लंबे धूसर धब्बे पहुंचें तो मैंकोज़ेब छिड़कें।",
      gu: "ડોડાની નીચેના ત્રીજા પાન સુધી લાંબા રાખોડી ડાઘ પહોંચે તો મેન્કોઝેબ છાંટો.",
      mr: "कणसाखालील तिसऱ्या पानापर्यंत लांब राखाडी डाग पोहोचल्यास मॅन्कोझेब फवारा.",
    },
    signs: "Long cigar-shaped grey-green to tan lesions (3-15 cm) on leaves, starting on lower leaves.",
    favours: "18-27 °C with heavy dew or 6+ hours of leaf wetness.",
    manage: {
      cultural: ["Resistant hybrids", "Crop rotation; bury residue"],
      chemical: ["Mancozeb, or azoxystrobin + difenoconazole"],
    },
    symptoms: { spots: 0.7, "eye-lesions": 0.4, "leaf-tip-dry": 0.3 },
    prior: 0.9,
  }),
  T({
    id: "maize-rust",
    kind: "fungal",
    crops: ["maize"],
    name: { en: "Common rust", hi: "मक्का का रतुआ", gu: "મકાઈનો ગેરુ", mr: "मक्याचा तांबेरा" },
    act: {
      en: "Usually minor; spray mancozeb only if pustules cover upper leaves before tasselling.",
      hi: "आमतौर पर कम नुकसान; नर मंजरी से पहले ऊपरी पत्तियां ढक जाएं तभी मैंकोज़ेब छिड़कें।",
      gu: "સામાન્ય રીતે ઓછું નુકસાન; નર ફૂલ પહેલાં ઉપરના પાન ઢંકાય તો જ મેન્કોઝેબ છાંટો.",
      mr: "सहसा कमी नुकसान; तुरा येण्यापूर्वी वरची पाने झाकली तरच मॅन्कोझेब फवारा.",
    },
    signs: "Small cinnamon-brown powdery pustules on both leaf surfaces.",
    favours: "Cool 16-23 °C nights with dew; rabi maize and hills.",
    manage: { cultural: ["Resistant hybrids"], chemical: ["Mancozeb if severe"] },
    symptoms: { "rust-pustules": 0.9, powder: 0.3 },
    prior: 0.6,
  }),
  T({
    id: "maize-gls",
    kind: "fungal",
    crops: ["maize"],
    name: { en: "Grey leaf spot", hi: "धूसर पत्ती धब्बा", gu: "રાખોડી પાનના ટપકાં", mr: "राखाडी पानठिपके" },
    act: {
      en: "Rotate crops and bury residue; spray a strobilurin fungicide if lesions spread before silking.",
      hi: "फसल चक्र अपनाएं, अवशेष दबाएं; रेशे निकलने से पहले फैलाव हो तो स्ट्रोबिलुरिन छिड़कें।",
      gu: "પાક ફેરબદલી કરો, અવશેષ દાટો; રેશમ પહેલાં ફેલાવો હોય તો સ્ટ્રોબિલ્યુરિન છાંટો.",
      mr: "पिकांची फेरपालट करा, अवशेष गाडा; स्त्रीकेसरापूर्वी प्रसार असल्यास स्ट्रोबिल्युरिन फवारा.",
    },
    signs: "Rectangular grey-tan lesions bounded by leaf veins.",
    favours: "Warm humid weather, long leaf wetness, maize-on-maize with surface residue.",
    manage: {
      cultural: ["Rotation", "Residue management", "Tolerant hybrids"],
      chemical: ["Azoxystrobin or pyraclostrobin"],
    },
    symptoms: { spots: 0.8, "leaf-tip-dry": 0.2 },
    prior: 0.6,
  }),
  // ---------------- Cotton ----------------
  T({
    id: "whitefly",
    kind: "insect",
    crops: ["cotton", "moong", "urad", "soybean", "tomato"],
    name: { en: "Whitefly", hi: "सफेद मक्खी", gu: "સફેદ માખી", mr: "पांढरी माशी" },
    act: {
      en: "Put up yellow sticky traps (10 per acre), spray neem oil; avoid repeated pyrethroids.",
      hi: "पीले चिपचिपे ट्रैप (10 प्रति एकड़) लगाएं, नीम तेल छिड़कें; बार-बार पायरेथ्रॉइड न डालें।",
      gu: "પીળા ચીકણા ટ્રેપ (એકરે 10) લગાવો, લીમડાનું તેલ છાંટો; વારંવાર પાયરેથ્રોઈડ ન વાપરો.",
      mr: "पिवळे चिकट सापळे (एकरी 10) लावा, निंबोळी तेल फवारा; वारंवार पायरेथ्रॉइड टाळा.",
    },
    signs:
      "Tiny white flies under leaves that fly up when disturbed; sticky leaves with black sooty mould; spreads leaf curl and yellow mosaic viruses.",
    favours: "Hot dry weather (over 30 °C, humidity under 60 %), dry spells, excess nitrogen.",
    manage: {
      cultural: ["Remove weed hosts", "Avoid excess nitrogen", "Grow barrier crops like maize or sorghum"],
      biological: ["Neem oil 1500 ppm", "Yellow sticky traps", "Conserve Encarsia parasitoids"],
      chemical: ["Spiromesifen, diafenthiuron or pyriproxyfen only above threshold; rotate groups"],
    },
    symptoms: { "sticky-insects": 0.85, yellowing: 0.4, "leaf-curl": 0.4, mosaic: 0.2 },
    prior: 1.2,
  }),
  T({
    id: "cotton-pbw",
    kind: "insect",
    crops: ["cotton"],
    name: { en: "Pink bollworm", hi: "गुलाबी सुंडी", gu: "ગુલાબી ઇયળ", mr: "गुलाबी बोंडअळी" },
    act: {
      en: "Use pheromone traps (5 per acre); destroy rosette flowers; spray only if 8 moths/trap/night for 3 nights.",
      hi: "फेरोमोन ट्रैप (5 प्रति एकड़) लगाएं; गुलाब जैसे फूल नष्ट करें; 3 रात तक 8 पतंगे/ट्रैप हों तभी छिड़काव करें।",
      gu: "ફેરોમોન ટ્રેપ (એકરે 5) લગાવો; ગુલાબ જેવા ફૂલ નાશ કરો; 3 રાત 8 ફૂદાં/ટ્રેપ હોય તો જ છંટકાવ કરો.",
      mr: "कामगंध सापळे (एकरी 5) लावा; डोमकळ्या नष्ट करा; 3 रात्री 8 पतंग/सापळा असल्यासच फवारणी करा.",
    },
    signs: "Rosette-shaped (unopened) flowers, small exit holes in bolls, pink larvae inside, stained lint.",
    favours: "Warm weather after flowering, extended cropping into winter, carry-over in stored seed.",
    manage: {
      cultural: ["Short-duration varieties; end crop by December", "Destroy crop residue; no ratooning"],
      biological: ["Pheromone mating disruption (PBKnot)", "Trichogramma bactrae"],
      chemical: ["Profenofos, emamectin benzoate or cypermethrin in rotation, as per label"],
    },
    symptoms: { "bored-fruit": 0.9, holes: 0.4, frass: 0.3 },
    prior: 1.1,
  }),
  T({
    id: "cotton-bacterial-blight",
    kind: "bacterial",
    crops: ["cotton"],
    name: { en: "Bacterial blight", hi: "जीवाणु झुलसा", gu: "જીવાણુ સુકારો", mr: "जिवाणूजन्य करपा" },
    act: {
      en: "Remove infected leaves; spray copper oxychloride + streptocycline (as permitted) after rain.",
      hi: "रोगी पत्तियां हटाएं; बारिश के बाद कॉपर ऑक्सीक्लोराइड छिड़कें।",
      gu: "રોગિષ્ઠ પાન દૂર કરો; વરસાદ પછી કોપર ઓક્સીક્લોરાઈડ છાંટો.",
      mr: "रोगट पाने काढा; पावसानंतर कॉपर ऑक्सिक्लोराईड फवारा.",
    },
    signs: "Angular water-soaked spots turning black between veins; black streaks on stems ('black arm').",
    favours: "Rain splash, 25-35 °C, humidity above 85 %.",
    manage: {
      cultural: ["Acid-delinted, treated seed", "Remove infected debris"],
      chemical: ["Copper oxychloride; antibiotic sprays only as per label"],
    },
    symptoms: { "water-soaked": 0.8, spots: 0.6, "rotting-stem": 0.2 },
    prior: 0.8,
  }),
  T({
    id: "cotton-alternaria",
    kind: "fungal",
    crops: ["cotton"],
    name: {
      en: "Alternaria leaf spot",
      hi: "आल्टरनेरिया पत्ती धब्बा",
      gu: "અલ્ટરનેરિયા પાનના ટપકાં",
      mr: "अल्टरनेरिया पानठिपके",
    },
    act: {
      en: "Spray mancozeb or propiconazole after continuous rain; give potash to correct deficiency.",
      hi: "लगातार बारिश के बाद मैंकोज़ेब या प्रोपिकोनाज़ोल छिड़कें; पोटाश दें।",
      gu: "સતત વરસાદ પછી મેન્કોઝેબ અથવા પ્રોપીકોનાઝોલ છાંટો; પોટાશ આપો.",
      mr: "सततच्या पावसानंतर मॅन्कोझेब किंवा प्रोपिकोनाझोल फवारा; पोटॅश द्या.",
    },
    signs: "Brown circular spots with concentric rings, often on older leaves; premature leaf fall.",
    favours: "Warm humid weather, 25-28 °C, potassium-deficient crops.",
    manage: { cultural: ["Balanced potash"], chemical: ["Mancozeb, propiconazole or azoxystrobin"] },
    symptoms: { "concentric-rings": 0.8, spots: 0.7, yellowing: 0.3 },
    prior: 0.8,
  }),
  T({
    id: "wilt",
    kind: "fungal",
    crops: ["cotton", "chickpea", "pigeonpea", "tomato", "potato"],
    name: {
      en: "Fusarium / Verticillium wilt",
      hi: "उकठा (विल्ट) रोग",
      gu: "સુકારો (વિલ્ટ)",
      mr: "मर रोग (विल्ट)",
    },
    act: {
      en: "Uproot and burn wilted plants; next season use resistant varieties, seed treatment and long rotations.",
      hi: "मुरझाए पौधे उखाड़कर नष्ट करें; अगली बार रोगरोधी किस्म, बीज उपचार और फसल चक्र अपनाएं।",
      gu: "સુકાયેલા છોડ ઉખાડી નાશ કરો; આવતી વખતે રોગપ્રતિકારક જાત, બીજ માવજત અને પાક ફેરબદલી કરો.",
      mr: "मरलेली झाडे उपटून नष्ट करा; पुढील हंगामात रोगप्रतिकारक वाण, बीजप्रक्रिया व फेरपालट करा.",
    },
    signs:
      "Plants wilt even though soil is moist; brown discolouration inside the stem when split; yellowing from lower leaves.",
    favours: "Soil-borne fungus surviving for years; warm soils; continuous cropping.",
    manage: {
      cultural: ["Resistant varieties", "3-4 year rotation", "Summer ploughing"],
      biological: ["Trichoderma seed treatment and soil application with compost"],
      chemical: ["Seed treatment with carbendazim; no cure once wilted"],
    },
    symptoms: { wilting: 0.9, yellowing: 0.5, "rotting-stem": 0.3 },
    prior: 0.9,
  }),
  T({
    id: "leaf-curl-virus",
    kind: "viral",
    crops: ["cotton", "tomato"],
    name: { en: "Leaf curl virus", hi: "पत्ती मरोड़ विषाणु", gu: "કોકડવા (લીફ કર્લ)", mr: "पर्णगुच्छ / पाने मुरडणे" },
    act: {
      en: "Remove infected plants early and manage whitefly; there is no cure for infected plants.",
      hi: "रोगी पौधे जल्दी हटाएं और सफेद मक्खी नियंत्रित करें; संक्रमित पौधे का इलाज नहीं है।",
      gu: "રોગિષ્ઠ છોડ વહેલા દૂર કરો અને સફેદ માખીનું નિયંત્રણ કરો; ચેપી છોડનો ઈલાજ નથી.",
      mr: "रोगट झाडे लवकर काढा व पांढरी माशी नियंत्रित करा; संसर्गित झाडावर उपचार नाही.",
    },
    signs: "Upward or downward curling, thickened veins, small crinkled leaves, stunted bushy plants.",
    favours: "High whitefly populations in warm dry weather.",
    manage: {
      cultural: ["Tolerant varieties/hybrids", "Raise seedlings under insect net", "Remove weed hosts"],
      chemical: ["Vector (whitefly) control only"],
    },
    symptoms: { "leaf-curl": 0.9, stunting: 0.5, yellowing: 0.3, mosaic: 0.3 },
    prior: 0.8,
  }),
  // ---------------- Groundnut ----------------
  T({
    id: "groundnut-leaf-spot",
    kind: "fungal",
    crops: ["groundnut"],
    name: {
      en: "Early & late leaf spot (tikka)",
      hi: "टिक्का रोग",
      gu: "ટિક્કા (પાનના ટપકાં)",
      mr: "टिक्का (पानठिपके)",
    },
    act: {
      en: "Spray carbendazim + mancozeb or tebuconazole when spots appear, usually 30-35 days after sowing.",
      hi: "धब्बे दिखते ही (बुवाई के 30-35 दिन बाद) कार्बेन्डाज़िम+मैंकोज़ेब या टेबुकोनाज़ोल छिड़कें।",
      gu: "ટપકાં દેખાય (વાવણી પછી 30-35 દિવસે) ત્યારે કાર્બેન્ડાઝીમ+મેન્કોઝેબ અથવા ટેબ્યુકોનાઝોલ છાંટો.",
      mr: "ठिपके दिसताच (पेरणीनंतर 30-35 दिवसांनी) कार्बेन्डाझिम+मॅन्कोझेब किंवा टेब्युकोनाझोल फवारा.",
    },
    signs:
      "Early: brown spots with a yellow halo. Late: dark brown-black round spots, mostly on the underside; heavy leaf fall.",
    favours: "Humidity above 90 % for 6+ hours with 20-30 °C (Jensen & Boyle leaf-spot advisory).",
    manage: {
      cultural: ["Rotation with cereals", "Remove volunteer plants", "Tolerant varieties"],
      biological: ["Pseudomonas fluorescens foliar spray"],
      chemical: ["Carbendazim + mancozeb, tebuconazole or chlorothalonil"],
    },
    symptoms: { spots: 0.9, yellowing: 0.3, "leaf-tip-dry": 0.2 },
    prior: 1.2,
  }),
  T({
    id: "groundnut-rust",
    kind: "fungal",
    crops: ["groundnut", "soybean"],
    name: { en: "Rust", hi: "रतुआ (गेरुआ)", gu: "ગેરુ", mr: "तांबेरा" },
    act: {
      en: "Spray hexaconazole or tebuconazole at first orange pustules on the lower leaf surface.",
      hi: "पत्ती के नीचे पहले नारंगी फफोले दिखते ही हेक्साकोनाज़ोल या टेबुकोनाज़ोल छिड़कें।",
      gu: "પાનની નીચે પ્રથમ નારંગી ફોલ્લા દેખાય કે હેક્ઝાકોનાઝોલ અથવા ટેબ્યુકોનાઝોલ છાંટો.",
      mr: "पानाच्या खाली पहिल्या नारिंगी पुटकुळ्या दिसताच हेक्साकोनाझोल किंवा टेब्युकोनाझोल फवारा.",
    },
    signs: "Orange-brown powdery pustules on the underside of leaves; leaves dry but stay attached.",
    favours: "20-26 °C, humidity above 85 %, prolonged leaf wetness.",
    manage: {
      cultural: ["Resistant varieties", "Timely sowing"],
      chemical: ["Hexaconazole, tebuconazole or propiconazole"],
    },
    symptoms: { "rust-pustules": 0.9, powder: 0.3, yellowing: 0.3 },
    prior: 0.9,
  }),
  T({
    id: "thrips",
    kind: "insect",
    crops: ["groundnut", "onion", "cotton"],
    name: { en: "Thrips", hi: "थ्रिप्स", gu: "થ્રિપ્સ", mr: "फुलकिडे" },
    act: {
      en: "Use blue sticky traps; spray neem oil or spinosad/fipronil if silvery streaks spread fast.",
      hi: "नीले चिपचिपे ट्रैप लगाएं; चांदी जैसी धारियां तेजी से फैलें तो नीम तेल या स्पिनोसैड छिड़कें।",
      gu: "વાદળી ચીકણા ટ્રેપ લગાવો; ચાંદી જેવી રેખાઓ ઝડપથી ફેલાય તો લીમડાનું તેલ અથવા સ્પિનોસાડ છાંટો.",
      mr: "निळे चिकट सापळे लावा; चंदेरी रेषा वेगाने पसरल्यास निंबोळी तेल किंवा स्पिनोसॅड फवारा.",
    },
    signs: "Silvery or white streaks and patches on leaves, curled tips; tiny slender insects in leaf folds.",
    favours: "Hot dry weather, 25-30 °C, dry spells.",
    manage: {
      cultural: ["Irrigation in dry spells", "Remove weed hosts"],
      biological: ["Blue sticky traps", "Neem oil"],
      chemical: ["Spinosad, fipronil or profenofos as per label"],
    },
    symptoms: { silvering: 0.9, "leaf-curl": 0.4, "sticky-insects": 0.3 },
    prior: 0.9,
  }),
  // ---------------- Soybean & pulses ----------------
  T({
    id: "yellow-mosaic",
    kind: "viral",
    crops: ["moong", "urad", "soybean"],
    name: { en: "Yellow mosaic virus", hi: "पीला मोज़ेक रोग", gu: "પીળો પંચરંગિયો", mr: "पिवळा मोझॅक (केवडा)" },
    act: {
      en: "Pull out infected plants within the first 30 days and control whitefly; sow tolerant varieties next time.",
      hi: "पहले 30 दिन में रोगी पौधे उखाड़ें और सफेद मक्खी नियंत्रित करें; अगली बार रोगरोधी किस्म बोएं।",
      gu: "પ્રથમ 30 દિવસમાં રોગિષ્ઠ છોડ ઉખાડો અને સફેદ માખી નિયંત્રિત કરો; આવતી વખતે પ્રતિકારક જાત વાવો.",
      mr: "पहिल्या 30 दिवसांत रोगट झाडे उपटा व पांढरी माशी नियंत्रित करा; पुढे सहनशील वाण पेरा.",
    },
    signs: "Bright yellow and green mosaic patches on leaves, later fully yellow leaves, few pods.",
    favours: "Whitefly build-up in hot dry spells; summer and early kharif sowings.",
    manage: {
      cultural: ["Tolerant varieties", "Rogue infected plants early", "Barrier crops"],
      chemical: ["Seed treatment with imidacloprid/thiamethoxam; whitefly sprays as per label"],
    },
    symptoms: { mosaic: 0.95, yellowing: 0.7, stunting: 0.3 },
    prior: 1.1,
  }),
  T({
    id: "powdery-mildew",
    kind: "fungal",
    crops: ["moong", "urad", "pigeonpea", "tomato", "onion"],
    name: { en: "Powdery mildew", hi: "चूर्णिल आसिता (भभूतिया)", gu: "ભૂકીછારો", mr: "भुरी" },
    act: {
      en: "Spray wettable sulphur or hexaconazole when white powder first appears.",
      hi: "सफेद पाउडर दिखते ही घुलनशील गंधक या हेक्साकोनाज़ोल छिड़कें।",
      gu: "સફેદ ભૂકી દેખાય કે તરત દ્રાવ્ય ગંધક અથવા હેક્ઝાકોનાઝોલ છાંટો.",
      mr: "पांढरी भुकटी दिसताच पाण्यात मिसळणारे गंधक किंवा हेक्साकोनाझोल फवारा.",
    },
    signs: "White powdery growth on leaves, stems and pods that can be rubbed off.",
    favours: "Dry days with humid nights, 20-26 °C; mainly rabi and late kharif.",
    manage: {
      cultural: ["Resistant varieties", "Avoid dense planting"],
      chemical: ["Wettable sulphur, hexaconazole or carbendazim"],
    },
    symptoms: { powder: 0.95, yellowing: 0.3 },
    prior: 0.9,
  }),
  T({
    id: "soybean-girdle-beetle",
    kind: "insect",
    crops: ["soybean"],
    name: { en: "Girdle beetle", hi: "गर्डल बीटल (चक्र भृंग)", gu: "ગર્ડલ બીટલ", mr: "चक्री भुंगा" },
    act: {
      en: "Remove and destroy wilted branches with girdles; spray a recommended insecticide if 10 % plants affected.",
      hi: "छल्ले वाली मुरझाई टहनियां तोड़कर नष्ट करें; 10% पौधे प्रभावित हों तो अनुशंसित दवा छिड़कें।",
      gu: "વલયવાળી સુકાયેલી ડાળીઓ તોડી નાશ કરો; 10% છોડ અસરગ્રસ્ત હોય તો ભલામણ કરેલ દવા છાંટો.",
      mr: "रिंग असलेल्या सुकलेल्या फांद्या तोडून नष्ट करा; 10% झाडे बाधित असल्यास शिफारस केलेले कीटकनाशक फवारा.",
    },
    signs: "Two ring-like cuts (girdles) on stems or petioles; the part above wilts and dries.",
    favours: "Mid-kharif, dense crops, continuous soybean.",
    manage: {
      cultural: ["Deep summer ploughing", "Avoid dense planting"],
      chemical: ["Thiacloprid or profenofos as per label"],
    },
    symptoms: { wilting: 0.6, "dead-heart": 0.3, holes: 0.2 },
    prior: 0.7,
  }),
  T({
    id: "pod-borer",
    kind: "insect",
    crops: ["chickpea", "pigeonpea", "cotton", "tomato"],
    name: {
      en: "Helicoverpa pod/fruit borer",
      hi: "फली छेदक (हेलिकोवर्पा)",
      gu: "લીલી ઇયળ (પોપટા કોરી ખાનાર)",
      mr: "घाटेअळी / शेंगा पोखरणारी अळी",
    },
    act: {
      en: "Install bird perches (20 per acre) and pheromone traps; spray HaNPV or emamectin benzoate at early larval stage.",
      hi: "पक्षी बैठने के डंडे (20 प्रति एकड़) व फेरोमोन ट्रैप लगाएं; शुरुआती इल्ली पर HaNPV या इमामेक्टिन छिड़कें।",
      gu: "પક્ષી બેસવાના ટેકા (એકરે 20) અને ફેરોમોન ટ્રેપ લગાવો; શરૂઆતની ઇયળ પર HaNPV અથવા ઇમામેક્ટિન છાંટો.",
      mr: "पक्षी थांबे (एकरी 20) व कामगंध सापळे लावा; लहान अळ्यांवर HaNPV किंवा इमामेक्टिन फवारा.",
    },
    signs:
      "Round holes in pods, bolls or fruits with half the larva outside; green-brown larvae with stripes.",
    favours: "Flowering and podding with warm 20-30 °C weather; cloudy days.",
    manage: {
      cultural: ["Intercrop with coriander or marigold trap crop", "Deep summer ploughing"],
      biological: ["HaNPV 250 LE/ha", "Bacillus thuringiensis", "Bird perches"],
      chemical: ["Emamectin benzoate, chlorantraniliprole or indoxacarb as per label"],
    },
    symptoms: { "bored-fruit": 0.9, holes: 0.6, frass: 0.4 },
    prior: 1.2,
  }),
  T({
    id: "chickpea-ascochyta",
    kind: "fungal",
    crops: ["chickpea"],
    name: { en: "Ascochyta blight", hi: "एस्कोकाइटा झुलसा", gu: "એસ્કોકાઈટા સુકારો", mr: "अॅस्कोकायटा करपा" },
    act: {
      en: "Spray mancozeb or chlorothalonil before the next rain if brown lesions with dark dots appear.",
      hi: "गहरे बिंदुओं वाले भूरे धब्बे दिखें तो अगली बारिश से पहले मैंकोज़ेब या क्लोरोथालोनिल छिड़कें।",
      gu: "ઘેરા બિંદુવાળા બદામી ડાઘ દેખાય તો આગલા વરસાદ પહેલાં મેન્કોઝેબ અથવા ક્લોરોથેલોનીલ છાંટો.",
      mr: "गडद ठिपके असलेले तपकिरी डाग दिसल्यास पुढील पावसापूर्वी मॅन्कोझेब किंवा क्लोरोथॅलोनिल फवारा.",
    },
    signs:
      "Brown lesions with concentric rings of dark dots on leaves, stems and pods; plants break at the stem.",
    favours: "Cool 15-25 °C with rain or humidity above 85 % for 2+ days.",
    manage: {
      cultural: ["Healthy seed", "Destroy debris", "Resistant varieties"],
      chemical: ["Seed treatment; mancozeb or chlorothalonil sprays"],
    },
    symptoms: { "concentric-rings": 0.6, spots: 0.7, "rotting-stem": 0.4, wilting: 0.3 },
    prior: 0.7,
  }),
  T({
    id: "pigeonpea-sterility-mosaic",
    kind: "viral",
    crops: ["pigeonpea"],
    name: { en: "Sterility mosaic", hi: "बांझ मोज़ेक रोग", gu: "વંધ્યત્વ પંચરંગિયો", mr: "वांझ मोझॅक" },
    act: {
      en: "Remove infected bushy plants early and control eriophyid mites with a recommended acaricide.",
      hi: "झाड़ीदार रोगी पौधे जल्दी हटाएं और माइट को अनुशंसित दवा से नियंत्रित करें।",
      gu: "ઝાડી જેવા રોગિષ્ઠ છોડ વહેલા દૂર કરો અને કથીરીનું ભલામણ કરેલ દવાથી નિયંત્રણ કરો.",
      mr: "झुडूपासारखी रोगट झाडे लवकर काढा व कोळीचे शिफारस केलेल्या औषधाने नियंत्रण करा.",
    },
    signs: "Pale mosaic, small leaves, bushy growth and no flowers or pods.",
    favours: "Mite-transmitted; perennial or ratoon pigeonpea nearby.",
    manage: {
      cultural: ["Resistant varieties", "Remove volunteer plants"],
      chemical: ["Acaricide (e.g. dicofol-free options) as per label"],
    },
    symptoms: { mosaic: 0.8, stunting: 0.7 },
    prior: 0.5,
  }),
  // ---------------- Mustard ----------------
  T({
    id: "mustard-alternaria",
    kind: "fungal",
    crops: ["mustard"],
    name: { en: "Alternaria blight", hi: "आल्टरनेरिया झुलसा", gu: "અલ્ટરનેરિયા સુકારો", mr: "अल्टरनेरिया करपा" },
    act: {
      en: "Spray mancozeb or iprodione when spots appear; repeat after 15 days in humid weather.",
      hi: "धब्बे दिखने पर मैंकोज़ेब या आइप्रोडियोन छिड़कें; नमी में 15 दिन बाद दोहराएं।",
      gu: "ટપકાં દેખાય ત્યારે મેન્કોઝેબ અથવા આઈપ્રોડીયોન છાંટો; ભેજમાં 15 દિવસે ફરી છાંટો.",
      mr: "ठिपके दिसल्यावर मॅन्कोझेब किंवा आयप्रोडिओन फवारा; दमट हवामानात 15 दिवसांनी पुन्हा फवारा.",
    },
    signs: "Brown-black round spots with concentric rings on leaves, stems and pods.",
    favours: "18-24 °C with humidity above 90 % for 10+ hours; late sowing.",
    manage: { cultural: ["Timely sowing", "Clean seed"], chemical: ["Mancozeb or iprodione"] },
    symptoms: { "concentric-rings": 0.8, spots: 0.8 },
    prior: 1,
  }),
  T({
    id: "mustard-white-rust",
    kind: "fungal",
    crops: ["mustard"],
    name: { en: "White rust", hi: "सफेद रतुआ", gu: "સફેદ ગેરુ", mr: "पांढरा तांबेरा" },
    act: {
      en: "Spray metalaxyl + mancozeb at first white blisters; remove 'stag head' deformed shoots.",
      hi: "पहले सफेद फफोले दिखते ही मेटालैक्सिल+मैंकोज़ेब छिड़कें; विकृत शाखाएं हटाएं।",
      gu: "પ્રથમ સફેદ ફોલ્લા દેખાય કે મેટાલેક્સિલ+મેન્કોઝેબ છાંટો; વિકૃત ડાળીઓ દૂર કરો.",
      mr: "पहिले पांढरे फोड दिसताच मेटॅलॅक्सिल+मॅन्कोझेब फवारा; विकृत फांद्या काढा.",
    },
    signs: "White raised blisters on the underside of leaves; swollen, deformed flower heads.",
    favours: "Cool 10-20 °C with high humidity or dew.",
    manage: { cultural: ["Resistant varieties", "Timely sowing"], chemical: ["Metalaxyl + mancozeb"] },
    symptoms: { powder: 0.6, "rust-pustules": 0.6, stunting: 0.2 },
    prior: 0.8,
  }),
  // ---------------- Millets & sugarcane ----------------
  T({
    id: "bajra-downy-mildew",
    kind: "fungal",
    crops: ["bajra"],
    name: {
      en: "Downy mildew (green ear)",
      hi: "हरित बाली रोग",
      gu: "તળછારો (લીલી કણસલી)",
      mr: "केवडा (हिरवी कणसे)",
    },
    act: {
      en: "Rogue out infected plants; next season use resistant hybrids and metalaxyl seed treatment.",
      hi: "रोगी पौधे उखाड़ें; अगली बार रोगरोधी संकर व मेटालैक्सिल बीज उपचार करें।",
      gu: "રોગિષ્ઠ છોડ ઉખાડો; આવતી વખતે પ્રતિકારક સંકર જાત અને મેટાલેક્સિલ બીજ માવજત કરો.",
      mr: "रोगट झाडे उपटा; पुढे प्रतिकारक संकरित वाण व मेटॅलॅक्सिल बीजप्रक्रिया करा.",
    },
    signs:
      "Yellow streaked leaves with white downy growth underneath; ears turn into leafy green structures.",
    favours: "Humidity above 90 % and 20-30 °C in the seedling stage.",
    manage: { cultural: ["Resistant hybrids", "Rotate fields"], chemical: ["Metalaxyl seed treatment"] },
    symptoms: { "white-mould-under": 0.8, yellowing: 0.6, stunting: 0.5 },
    prior: 0.8,
  }),
  T({
    id: "jowar-grain-mold",
    kind: "fungal",
    crops: ["jowar", "bajra"],
    name: { en: "Grain mould", hi: "दाना फफूंद", gu: "દાણાની ફૂગ", mr: "दाण्यावरील बुरशी" },
    act: {
      en: "Harvest at physiological maturity and dry grain quickly; choose early-maturing types to escape late rains.",
      hi: "पकते ही कटाई करें और दाना जल्दी सुखाएं; देर की बारिश से बचने के लिए जल्दी पकने वाली किस्म चुनें।",
      gu: "પાકતાં જ કાપણી કરો અને દાણા ઝડપથી સૂકવો; મોડા વરસાદથી બચવા વહેલી પાકતી જાત પસંદ કરો.",
      mr: "पक्व होताच कापणी करा व दाणे लवकर वाळवा; उशिराच्या पावसापासून वाचण्यासाठी लवकर पक्व होणारे वाण निवडा.",
    },
    signs: "Pink, black or white mould on grains in the earhead; light, discoloured grain.",
    favours: "Rain and high humidity during grain filling.",
    manage: {
      cultural: ["Adjust sowing so grain fill avoids rains", "Timely harvest and drying"],
      chemical: ["Propiconazole at flowering in high-risk areas"],
    },
    symptoms: { "mouldy-grain": 0.9, spots: 0.2 },
    prior: 0.6,
  }),
  T({
    id: "sugarcane-red-rot",
    kind: "fungal",
    crops: ["sugarcane"],
    name: { en: "Red rot", hi: "लाल सड़न", gu: "રાતો સડો", mr: "लाल कूज" },
    act: {
      en: "Uproot and burn affected clumps; use healthy setts of resistant varieties and do not ratoon infected fields.",
      hi: "प्रभावित झुंड उखाड़कर जलाएं; रोगरोधी किस्म के स्वस्थ बीज टुकड़े लगाएं, रोगी खेत की पेड़ी न रखें।",
      gu: "અસરગ્રસ્ત જડિયાં ઉખાડી બાળો; પ્રતિકારક જાતના તંદુરસ્ત કટકા વાપરો, રોગિષ્ઠ ખેતરનો લામ ન રાખો.",
      mr: "बाधित बेटे उपटून जाळा; प्रतिकारक वाणाचे निरोगी बेणे वापरा, रोगट शेतात खोडवा घेऊ नका.",
    },
    signs:
      "Yellowing and drying of top leaves; split cane shows red tissue with white cross-bands and a sour smell.",
    favours: "Waterlogging, 25-30 °C, humid weather, infected setts.",
    manage: {
      cultural: ["Resistant varieties", "Healthy seed nursery", "Good drainage", "Crop rotation"],
      biological: ["Trichoderma sett treatment"],
      chemical: ["Sett treatment with carbendazim"],
    },
    symptoms: { "rotting-stem": 0.9, yellowing: 0.5, wilting: 0.5 },
    prior: 0.7,
  }),
  T({
    id: "sugarcane-shoot-borer",
    kind: "insect",
    crops: ["sugarcane"],
    name: { en: "Early shoot borer", hi: "अगेती तना छेदक", gu: "ડૂંખ કોરી ખાનાર ઇયળ", mr: "लवकर येणारा खोडकिडा" },
    act: {
      en: "Earth up at 45 days, irrigate frequently and apply chlorantraniliprole or release Trichogramma chilonis.",
      hi: "45 दिन पर मिट्टी चढ़ाएं, बार-बार सिंचाई करें, ट्राइकोग्रामा छोड़ें या अनुशंसित दवा डालें।",
      gu: "45 દિવસે માટી ચઢાવો, વારંવાર પિયત આપો, ટ્રાઈકોગ્રામા છોડો અથવા ભલામણ કરેલ દવા આપો.",
      mr: "45 दिवसांनी भर द्या, वारंवार पाणी द्या, ट्रायकोग्रामा सोडा किंवा शिफारस केलेले औषध द्या.",
    },
    signs: "Dead hearts in 1-3 month old shoots that pull out easily and smell foul.",
    favours: "Hot dry weather in the early crop.",
    manage: {
      cultural: ["Trash mulching", "Frequent light irrigation"],
      biological: ["Trichogramma chilonis"],
      chemical: ["Chlorantraniliprole as per label"],
    },
    symptoms: { "dead-heart": 0.9, wilting: 0.3 },
    prior: 0.8,
  }),
  // ---------------- Potato, onion, tomato ----------------
  T({
    id: "late-blight",
    kind: "fungal",
    crops: ["potato", "tomato"],
    name: { en: "Late blight", hi: "पछेती झुलसा", gu: "પાછોતરો સુકારો", mr: "उशिरा येणारा करपा" },
    act: {
      en: "Spray mancozeb now as protection; if spots appear, use cymoxanil + mancozeb or metalaxyl + mancozeb.",
      hi: "अभी बचाव के लिए मैंकोज़ेब छिड़कें; धब्बे दिखें तो साइमोक्सानिल+मैंकोज़ेब छिड़कें।",
      gu: "હમણાં રક્ષણ માટે મેન્કોઝેબ છાંટો; ટપકાં દેખાય તો સાયમોક્ઝાનિલ+મેન્કોઝેબ છાંટો.",
      mr: "आता संरक्षणासाठी मॅन्कोझेब फवारा; डाग दिसल्यास सायमोक्सॅनिल+मॅन्कोझेब फवारा.",
    },
    signs:
      "Dark water-soaked patches on leaves with white mould on the underside in the morning; brown rot in tubers/fruits.",
    favours: "'Hutton periods': two days with minimum 10 °C or above and 6+ hours of humidity above 90 %.",
    manage: {
      cultural: ["Certified seed tubers", "Ridge-up to protect tubers", "Destroy cull piles and volunteers"],
      chemical: ["Protective mancozeb; curative cymoxanil or metalaxyl mixtures, rotated"],
    },
    symptoms: {
      "water-soaked": 0.8,
      "white-mould-under": 0.6,
      spots: 0.5,
      "rotting-stem": 0.3,
      wilting: 0.2,
    },
    prior: 1.1,
  }),
  T({
    id: "early-blight",
    kind: "fungal",
    crops: ["potato", "tomato"],
    name: { en: "Early blight", hi: "अगेती झुलसा", gu: "આગોતરો સુકારો", mr: "लवकर येणारा करपा" },
    act: {
      en: "Remove lower infected leaves and spray mancozeb or azoxystrobin; keep the crop well nourished.",
      hi: "नीचे की रोगी पत्तियां हटाएं, मैंकोज़ेब या एज़ोक्सीस्ट्रोबिन छिड़कें; पोषण ठीक रखें।",
      gu: "નીચેના રોગિષ્ઠ પાન દૂર કરો, મેન્કોઝેબ અથવા એઝોક્સીસ્ટ્રોબિન છાંટો; પોષણ યોગ્ય રાખો.",
      mr: "खालची रोगट पाने काढा, मॅन्कोझेब किंवा अॅझोक्सिस्ट्रोबिन फवारा; पोषण योग्य ठेवा.",
    },
    signs: "Brown spots with concentric rings ('target board') on older leaves, yellow halo.",
    favours: "Warm 24-29 °C with alternating wet and dry periods; stressed or nitrogen-poor plants.",
    manage: {
      cultural: ["Rotation", "Balanced nutrition", "Remove debris"],
      chemical: ["Mancozeb, chlorothalonil or azoxystrobin"],
    },
    symptoms: { "concentric-rings": 0.9, spots: 0.7, yellowing: 0.4 },
    prior: 1,
  }),
  T({
    id: "onion-purple-blotch",
    kind: "fungal",
    crops: ["onion"],
    name: { en: "Purple blotch", hi: "बैंगनी धब्बा", gu: "જાંબલી ધાબાં", mr: "जांभळा करपा" },
    act: {
      en: "Spray mancozeb or tebuconazole with a sticker after rain; avoid overhead irrigation.",
      hi: "बारिश के बाद चिपकने वाले पदार्थ के साथ मैंकोज़ेब या टेबुकोनाज़ोल छिड़कें।",
      gu: "વરસાદ પછી સ્ટીકર સાથે મેન્કોઝેબ અથવા ટેબ્યુકોનાઝોલ છાંટો.",
      mr: "पावसानंतर चिकट द्रवासह मॅन्कोझेब किंवा टेब्युकोनाझोल फवारा.",
    },
    signs: "Small white sunken spots that grow into purple lesions with yellow margins; leaves collapse.",
    favours: "20-30 °C with humidity above 80-90 % for long periods; kharif onion.",
    manage: {
      cultural: ["Rotation", "Good drainage", "Raised beds"],
      chemical: ["Mancozeb, tebuconazole or difenoconazole"],
    },
    symptoms: { "purple-patches": 0.9, spots: 0.6, "leaf-tip-dry": 0.4 },
    prior: 1,
  }),
  T({
    id: "tomato-bacterial-spot",
    kind: "bacterial",
    crops: ["tomato"],
    name: { en: "Bacterial spot", hi: "जीवाणु धब्बा", gu: "જીવાણુ ટપકાં", mr: "जिवाणूजन्य ठिपके" },
    act: {
      en: "Avoid working in wet plants; spray copper oxychloride and remove badly spotted leaves.",
      hi: "गीले पौधों में काम न करें; कॉपर ऑक्सीक्लोराइड छिड़कें और ज्यादा धब्बेदार पत्तियां हटाएं।",
      gu: "ભીના છોડમાં કામ ન કરો; કોપર ઓક્સીક્લોરાઈડ છાંટો અને વધારે ટપકાંવાળા પાન દૂર કરો.",
      mr: "ओल्या झाडांत काम करू नका; कॉपर ऑक्सिक्लोराईड फवारा व जास्त ठिपके असलेली पाने काढा.",
    },
    signs: "Small dark greasy spots on leaves and raised scabby spots on fruits.",
    favours: "Warm wet weather and splashing water.",
    manage: {
      cultural: ["Clean seed and transplants", "Drip instead of sprinkler"],
      chemical: ["Copper oxychloride"],
    },
    symptoms: { spots: 0.8, "water-soaked": 0.5 },
    prior: 0.8,
  }),
  T({
    id: "tomato-septoria",
    kind: "fungal",
    crops: ["tomato"],
    name: {
      en: "Septoria leaf spot",
      hi: "सेप्टोरिया पत्ती धब्बा",
      gu: "સેપ્ટોરિયા પાનના ટપકાં",
      mr: "सेप्टोरिया पानठिपके",
    },
    act: {
      en: "Remove lower spotted leaves, mulch the soil and spray mancozeb or chlorothalonil.",
      hi: "नीचे की धब्बेदार पत्तियां हटाएं, मल्चिंग करें और मैंकोज़ेब छिड़कें।",
      gu: "નીચેના ટપકાંવાળા પાન દૂર કરો, મલ્ચિંગ કરો અને મેન્કોઝેબ છાંટો.",
      mr: "खालची ठिपकेदार पाने काढा, आच्छादन करा व मॅन्कोझेब फवारा.",
    },
    signs: "Many small round spots with grey centres and dark borders on lower leaves.",
    favours: "Wet, humid weather, 20-25 °C.",
    manage: { cultural: ["Mulch", "Stake plants", "Rotation"], chemical: ["Mancozeb or chlorothalonil"] },
    symptoms: { spots: 0.9, yellowing: 0.4 },
    prior: 0.7,
  }),
  T({
    id: "tomato-leaf-mold",
    kind: "fungal",
    crops: ["tomato"],
    name: { en: "Leaf mould", hi: "पत्ती फफूंद", gu: "પાનની ફૂગ", mr: "पानावरील बुरशी" },
    act: {
      en: "Improve air flow (pruning, spacing) and spray a recommended fungicide.",
      hi: "छंटाई व दूरी से हवा का प्रवाह बढ़ाएं और अनुशंसित फफूंदनाशी छिड़कें।",
      gu: "છટણી અને અંતર રાખીને હવા ઉજાસ વધારો અને ભલામણ કરેલ ફૂગનાશક છાંટો.",
      mr: "छाटणी व अंतर ठेवून हवा खेळती ठेवा आणि शिफारस केलेले बुरशीनाशक फवारा.",
    },
    signs: "Pale yellow patches on top of leaves with olive-green velvety mould underneath.",
    favours: "Humidity above 85 %, especially in protected cultivation.",
    manage: { cultural: ["Ventilation", "Avoid wetting leaves"], chemical: ["Chlorothalonil or mancozeb"] },
    symptoms: { yellowing: 0.6, "white-mould-under": 0.6, spots: 0.4 },
    prior: 0.5,
  }),
  T({
    id: "tomato-target-spot",
    kind: "fungal",
    crops: ["tomato"],
    name: {
      en: "Target spot",
      hi: "टारगेट स्पॉट (लक्ष्य धब्बा)",
      gu: "ટાર્ગેટ સ્પોટ",
      mr: "टार्गेट स्पॉट (लक्ष्य ठिपका)",
    },
    act: {
      en: "Remove lower infected leaves, improve air flow and spray chlorothalonil or azoxystrobin.",
      hi: "नीचे की रोगी पत्तियां हटाएं, हवा का प्रवाह बढ़ाएं और क्लोरोथालोनिल या एज़ोक्सीस्ट्रोबिन छिड़कें।",
      gu: "નીચેના રોગિષ્ઠ પાન દૂર કરો, હવા ઉજાસ વધારો અને ક્લોરોથેલોનીલ અથવા એઝોક્સીસ્ટ્રોબિન છાંટો.",
      mr: "खालची रोगट पाने काढा, हवा खेळती ठेवा व क्लोरोथॅलोनिल किंवा अॅझोक्सिस्ट्रोबिन फवारा.",
    },
    signs:
      "Brown spots with light centres and concentric rings on leaves, stems and fruit; leaves yellow and drop.",
    favours: "Warm (20-28 °C), humid weather with long leaf wetness; dense canopies.",
    manage: {
      cultural: ["Prune lower leaves and stake plants", "Rotation; remove crop debris"],
      chemical: ["Chlorothalonil, azoxystrobin or difenoconazole as per label"],
    },
    symptoms: { "concentric-rings": 0.8, spots: 0.8, yellowing: 0.3 },
    prior: 0.5,
  }),
  T({
    id: "spider-mites",
    kind: "mite",
    crops: ["tomato", "cotton", "pigeonpea"],
    name: { en: "Spider mites", hi: "लाल मकड़ी (माइट)", gu: "લાલ કથીરી", mr: "लाल कोळी" },
    act: {
      en: "Spray water on leaf undersides, then a recommended acaricide or neem oil; avoid broad-spectrum insecticides.",
      hi: "पत्तियों के नीचे पानी का छिड़काव करें, फिर अनुशंसित माइटनाशी या नीम तेल डालें।",
      gu: "પાનની નીચે પાણીનો છંટકાવ કરો, પછી ભલામણ કરેલ કથીરીનાશક અથવા લીમડાનું તેલ છાંટો.",
      mr: "पानांच्या खाली पाण्याची फवारणी करा, नंतर शिफारस केलेले कोळीनाशक किंवा निंबोळी तेल फवारा.",
    },
    signs: "Fine yellow speckling, bronzed leaves and fine webbing under leaves.",
    favours: "Hot dry dusty weather.",
    manage: {
      cultural: ["Irrigate in dry spells", "Reduce dust"],
      biological: ["Neem oil"],
      chemical: ["Spiromesifen or fenpyroximate"],
    },
    symptoms: { webbing: 0.9, yellowing: 0.5, silvering: 0.3 },
    prior: 0.7,
  }),
  T({
    id: "tomato-mosaic",
    kind: "viral",
    crops: ["tomato"],
    name: { en: "Tomato mosaic virus", hi: "टमाटर मोज़ेक विषाणु", gu: "ટામેટાનો પંચરંગિયો", mr: "टोमॅटो मोझॅक" },
    act: {
      en: "Remove infected plants, wash hands and tools; avoid tobacco use while handling plants.",
      hi: "रोगी पौधे हटाएं, हाथ व औजार धोएं; पौधे छूते समय तंबाकू का उपयोग न करें।",
      gu: "રોગિષ્ઠ છોડ દૂર કરો, હાથ અને ઓજારો ધોવો; છોડ સંભાળતી વખતે તમાકુ ન વાપરો.",
      mr: "रोगट झाडे काढा, हात व अवजारे धुवा; झाडे हाताळताना तंबाखू वापरू नका.",
    },
    signs: "Light and dark green mottling, distorted fern-like leaves, uneven fruit ripening.",
    favours: "Spread by hands, tools and infected seed.",
    manage: { cultural: ["Resistant varieties", "Hygiene", "Clean seed"] },
    symptoms: { mosaic: 0.9, "leaf-curl": 0.3, stunting: 0.3 },
    prior: 0.5,
  }),
  // ---------------- Abiotic & general (all crops) ----------------
  T({
    id: "drought",
    kind: "abiotic",
    crops: "all",
    name: {
      en: "Drought and heat stress",
      hi: "सूखा और गर्मी का तनाव",
      gu: "સૂકું અને ગરમીનો તણાવ",
      mr: "दुष्काळ व उष्णतेचा ताण",
    },
    act: {
      en: "Irrigate at critical stages (flowering, grain filling) in the evening; mulch to save moisture.",
      hi: "महत्वपूर्ण अवस्थाओं (फूल, दाना भरना) पर शाम को सिंचाई करें; नमी बचाने के लिए मल्चिंग करें।",
      gu: "મહત્વના તબક્કે (ફૂલ, દાણા ભરાવા) સાંજે પિયત આપો; ભેજ બચાવવા મલ્ચિંગ કરો.",
      mr: "महत्त्वाच्या अवस्थेत (फुलोरा, दाणे भरणे) संध्याकाळी पाणी द्या; ओलावा टिकवण्यासाठी आच्छादन करा.",
    },
    signs: "Leaves roll or wilt in the afternoon, scorched edges, cracked dry soil, poor grain filling.",
    favours: "Long dry spells, high temperatures and strong sun.",
    manage: {
      cultural: [
        "Mulching",
        "Drip or alternate-furrow irrigation",
        "Drought-tolerant varieties",
        "Foliar KNO3 2 % in severe stress",
      ],
    },
    symptoms: { "dry-cracked": 0.9, wilting: 0.6, "leaf-tip-dry": 0.5, stunting: 0.4, yellowing: 0.3 },
    prior: 1.2,
  }),
  T({
    id: "waterlogging",
    kind: "abiotic",
    crops: "all",
    name: { en: "Waterlogging", hi: "जलभराव", gu: "પાણી ભરાવો", mr: "पाणी साचणे" },
    act: {
      en: "Open drains so water leaves within 24-48 hours; top-dress nitrogen once the soil can be worked.",
      hi: "नालियां खोलें ताकि 24-48 घंटे में पानी निकल जाए; मिट्टी सूखने पर नाइट्रोजन दें।",
      gu: "નીકો ખોલો જેથી 24-48 કલાકમાં પાણી નીકળી જાય; જમીન સૂકાય પછી નાઈટ્રોજન આપો.",
      mr: "चर उघडा म्हणजे 24-48 तासांत पाणी निघून जाईल; जमीन वाफशावर आल्यावर नत्र द्या.",
    },
    signs: "Standing water, yellowing from lower leaves, rotting roots with a sour smell.",
    favours: "Heavy rain on poorly drained or clay soils.",
    manage: {
      cultural: ["Raised beds or ridges", "Field drains before monsoon", "Split nitrogen after recovery"],
    },
    symptoms: { "standing-water": 0.95, yellowing: 0.6, wilting: 0.4, "rotting-stem": 0.3 },
    prior: 0.8,
  }),
  T({
    id: "nutrient",
    kind: "abiotic",
    crops: "all",
    name: {
      en: "Nutrient deficiency",
      hi: "पोषक तत्वों की कमी",
      gu: "પોષક તત્વોની ઉણપ",
      mr: "अन्नद्रव्यांची कमतरता",
    },
    act: {
      en: "Get a soil test (Soil Health Card); yellow older leaves suggest nitrogen, striped young leaves suggest zinc or iron.",
      hi: "मिट्टी जांच (मृदा स्वास्थ्य कार्ड) कराएं; पुरानी पीली पत्तियां नाइट्रोजन, धारीदार नई पत्तियां जिंक/लोहे की कमी दर्शाती हैं।",
      gu: "જમીન ચકાસણી (સોઈલ હેલ્થ કાર્ડ) કરાવો; જૂના પીળા પાન નાઈટ્રોજન, પટ્ટાવાળા નવા પાન ઝીંક/લોહની ઉણપ સૂચવે છે.",
      mr: "माती परीक्षण (मृदा आरोग्य पत्रिका) करा; जुनी पिवळी पाने नत्र, रेषा असलेली नवी पाने झिंक/लोह कमतरता दाखवतात.",
    },
    signs:
      "Uniform yellowing, purple tints, striped or pale young leaves, stunted growth without spots or insects.",
    favours: "Poor soils, imbalanced fertiliser, waterlogging or very high pH.",
    manage: {
      cultural: [
        "Fertilise by soil test",
        "Compost or farmyard manure",
        "Zinc sulphate where deficient",
        "Legumes in rotation",
      ],
    },
    symptoms: { yellowing: 0.85, stunting: 0.6, "purple-patches": 0.3, spots: 0.1 },
    prior: 1.1,
  }),
  T({
    id: "weeds",
    kind: "abiotic",
    crops: "all",
    name: { en: "Weed competition", hi: "खरपतवार", gu: "નીંદણ", mr: "तण" },
    act: {
      en: "Weed within the first 30-40 days; hoe between rows or use a recommended herbicide at the right stage.",
      hi: "पहले 30-40 दिन में निराई करें; कतारों के बीच गुड़ाई करें या सही समय पर अनुशंसित खरपतवारनाशी डालें।",
      gu: "પ્રથમ 30-40 દિવસમાં નીંદામણ કરો; હાર વચ્ચે આંતરખેડ કરો અથવા યોગ્ય સમયે ભલામણ કરેલ નીંદણનાશક વાપરો.",
      mr: "पहिल्या 30-40 दिवसांत खुरपणी करा; ओळींमध्ये कोळपणी करा किंवा योग्य वेळी शिफारस केलेले तणनाशक वापरा.",
    },
    signs: "Weeds covering the ground between rows, crop thin and pale.",
    favours: "Early season after rains, poor seedbed preparation.",
    manage: {
      cultural: ["Stale seedbed", "Mulching", "Inter-row hoeing", "Clean seed"],
      chemical: ["Pre- or post-emergence herbicide registered for the crop"],
    },
    symptoms: { weeds: 0.95, stunting: 0.3, yellowing: 0.2 },
    prior: 0.9,
  }),
  T({
    id: "lodging",
    kind: "abiotic",
    crops: "all",
    name: {
      en: "Storm damage and lodging",
      hi: "आंधी से नुकसान, फसल गिरना",
      gu: "વાવાઝોડાથી નુકસાન, પાક ઢળી પડવો",
      mr: "वादळी नुकसान, पीक लोळणे",
    },
    act: {
      en: "Harvest mature crop quickly; for young crop, drain water and stake or earth up plants. Report loss to your insurer within 72 hours.",
      hi: "पकी फसल जल्दी काटें; कच्ची फसल में पानी निकालें व मिट्टी चढ़ाएं। 72 घंटे में बीमा कंपनी को सूचना दें।",
      gu: "પાકેલો પાક ઝડપથી કાપો; કાચા પાકમાં પાણી કાઢો અને માટી ચઢાવો. 72 કલાકમાં વીમા કંપનીને જાણ કરો.",
      mr: "पक्व पीक लवकर काढा; कोवळ्या पिकात पाणी काढा व भर द्या. 72 तासांत विमा कंपनीला कळवा.",
    },
    signs: "Plants bent or flat on the ground after wind or heavy rain.",
    favours: "Strong wind with rain, tall varieties, excess nitrogen.",
    manage: { cultural: ["Short, stiff-stemmed varieties", "Balanced nitrogen", "Earthing up"] },
    symptoms: { lodged: 0.95, holes: 0.1 },
    prior: 0.6,
  }),
  T({
    id: "storage",
    kind: "abiotic",
    crops: "all",
    name: {
      en: "Storage pests and moulds",
      hi: "भंडारण कीट व फफूंद",
      gu: "સંગ્રહમાં જીવાત અને ફૂગ",
      mr: "साठवणीतील कीड व बुरशी",
    },
    act: {
      en: "Dry grain below 12 % moisture, store in clean hermetic bags on pallets, inspect every two weeks.",
      hi: "दाना 12% नमी से कम सुखाएं, साफ हवाबंद बोरियों में तख्तों पर रखें, हर दो हफ्ते जांचें।",
      gu: "દાણા 12% ભેજથી ઓછા સૂકવો, સ્વચ્છ હવાચુસ્ત થેલીઓમાં પાટિયા પર રાખો, દર બે અઠવાડિયે તપાસો.",
      mr: "धान्य 12% पेक्षा कमी ओलाव्यापर्यंत वाळवा, स्वच्छ हवाबंद पिशव्यांत फळ्यांवर ठेवा, दर दोन आठवड्यांनी तपासा.",
    },
    signs: "Holes in grains, powdery residue, webbing, musty smell or visible mould.",
    favours: "Moist grain, warm stores, old infested bags.",
    manage: {
      cultural: ["Proper drying", "Hermetic storage", "Clean stores"],
      chemical: ["Approved fumigation only by trained persons"],
    },
    symptoms: { "mouldy-grain": 0.8, holes: 0.3, webbing: 0.2 },
    prior: 0.5,
  }),
  T({
    id: "animals",
    kind: "abiotic",
    crops: "all",
    name: {
      en: "Birds and wild animals",
      hi: "पक्षी और जंगली जानवर",
      gu: "પક્ષીઓ અને જંગલી પ્રાણીઓ",
      mr: "पक्षी व वन्य प्राणी",
    },
    act: {
      en: "Use reflective tape and bird scarers at ripening; fence or trench vulnerable edges.",
      hi: "पकने पर चमकीली पट्टी और पक्षी भगाने वाले साधन लगाएं; किनारों पर बाड़ लगाएं।",
      gu: "પાકતી વખતે ચળકતી પટ્ટી અને પક્ષી ભગાડવાના સાધન વાપરો; કિનારે વાડ કરો.",
      mr: "पक्व होताना चकाकणाऱ्या पट्ट्या व पक्षी हाकणारे साधन वापरा; कडेला कुंपण करा.",
    },
    signs: "Trampled or grazed plants, missing seedlings, pecked earheads.",
    favours: "Fields near forest edges, ripening crop.",
    manage: { cultural: ["Bio-fencing", "Night guarding", "Prompt harvest"] },
    symptoms: { trampled: 0.95, holes: 0.2 },
    prior: 0.4,
  }),
];

export const threatById = new Map(THREATS.map((t) => [t.id, t]));

export function threatsForCrop(crop: CropId): Threat[] {
  return THREATS.filter((t) => t.crops === "all" || t.crops.includes(crop));
}

export const SYMPTOM_LIST: Symptom[] = [
  "spots",
  "eye-lesions",
  "concentric-rings",
  "rust-pustules",
  "powder",
  "water-soaked",
  "white-mould-under",
  "purple-patches",
  "leaf-tip-dry",
  "yellowing",
  "mosaic",
  "leaf-curl",
  "silvering",
  "wilting",
  "stunting",
  "rotting-stem",
  "holes",
  "frass",
  "bored-fruit",
  "dead-heart",
  "sticky-insects",
  "webbing",
  "dry-cracked",
  "standing-water",
  "lodged",
  "weeds",
  "mouldy-grain",
  "trampled",
];
