export const GENDERS = ["Female", "Male", "Non-binary", "Trans Female", "Trans Male"];
export const ORIENTATIONS = ["Heterosexual", "Bisexual", "Homosexual", "Pansexual", "Asexual"];
export const NATIONALITIES = ["American", "British", "German", "French", "Italian", "Spanish", "Japanese", "Korean", "Chinese", "Brazilian", "Russian", "Australian", "Canadian", "Mexican", "Indian", "Swedish", "Norwegian", "Dutch", "Polish", "Ukrainian", "Thai", "Colombian", "Argentine", "Turkish", "Egyptian", "Irish"];
export const LANGUAGES = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Japanese", "Korean", "Chinese", "Russian", "Arabic", "Hindi", "Turkish", "Polish", "Dutch", "Swedish", "Thai", "Vietnamese"];
export const ETHNICITIES = ["Slavic", "Caucasian", "Asian", "Hispanic", "Arabic", "Black", "Latino", "Indian", "Scandinavian"];
export const VOICES = ["Gentle", "High-pitched", "Deep", "Rough", "Calm"];
export const EYE_COLORS = ["Blue", "Brown", "Green", "Hazel", "Gray", "Amber", "Violet", "Black"];
export const HAIR_STYLES = ["Straight", "Wavy", "Curly", "Braids", "Bun", "Ponytail", "Pixie Cut", "Bob", "Long Layers", "Dreadlocks", "Bangs", "Twin Tails", "Updo", "Messy", "Side Part"];
export const HAIR_COLORS = ["Blonde", "Brunette", "Black", "Red", "Auburn", "Platinum", "Silver", "Pink", "Blue", "Purple", "Ombre", "Strawberry Blonde", "Copper", "Caramel"];
export const BODY_TYPES = ["Petite", "Slim", "Athletic", "Curvy", "Thick", "Hourglass", "Fit", "Voluptuous", "Muscular"];
export const BREAST_SIZES = ["Flat", "Small", "Medium", "Large", "Huge"];
export const BUTT_SIZES = ["Flat", "Small", "Medium", "Large", "Huge"];
export const RELATIONSHIP_TYPES = ["Girlfriend", "Boyfriend", "Friend", "Companion", "Mentor", "Rival", "Secret Lover", "Soulmate", "Sugar Baby", "Mistress", "Dominatrix", "Submissive Partner"];
export const FAMILY_STATUSES = ["Single", "In a Relationship", "Married", "Divorced", "Widowed", "Separated", "Complicated"];
export const LIFESTYLES = ["Active", "Lazy", "Homebody", "Sporty", "Party Girl", "Workaholic", "Adventurer", "Minimalist", "Luxurious", "Bohemian", "Health-Conscious", "Night Owl"];
export const WORKS = ["Student", "Model", "Nurse", "Teacher", "Fitness Trainer", "Influencer", "Artist", "Photographer", "Doctor", "Programmer", "Chef", "Dancer", "Barista", "Entrepreneur"];
export const HOBBIES = ["Pottery", "Photography", "Painting", "Yoga", "Dancing", "Cooking", "Reading", "Gaming", "Hiking", "Swimming", "Surfing", "Singing", "Piano", "Guitar", "Gardening", "Cosplay", "Fashion", "Travel", "Anime", "Writing", "Meditation", "Rock Climbing", "Horseback Riding", "Archery", "Martial Arts", "Wine Tasting", "Baking", "Shopping", "Film Making"];
export const KINKS_1 = ["Role Play", "Teacher/Student", "Boss/Secretary", "Strangers", "Cosplay", "Nurse", "Maid", "Public", "Massage", "Roommate"];
export const KINKS_2 = ["Dominant", "Submissive", "Bondage", "Blindfold", "Handcuffs", "Teasing", "Edging", "Praise", "Pet Play", "Collar"];
export const KINKS_3 = ["Lingerie", "Leather", "Latex", "Stockings", "High Heels", "Uniform", "Wax", "Dirty Talk", "Voyeurism", "Exhibitionism"];
/** Границы слайдера возраста; на максимуме показываем «55+». */
export const AGE_MIN = 18;
export const AGE_MAX = 55;

export const STYLES = ["Realistic", "Semi-real", "Anime", "2d"];

export const PERSONALITIES = [
  { name: "Overly Confident", desc: "Bold and dominating, with a magnetic presence in intimacy." },
  { name: "Mysterious", desc: "Secretive and intriguing, sparking curiosity in others." },
  { name: "Obsessed With You", desc: "Possessive and needy, with an intense focus on love." },
  { name: "Caregiver", desc: "Tender and nurturing, providing comforting sensuality." },
  { name: "Dominant", desc: "Assertive and commanding, arousing in erotic encounters." },
  { name: "Submissive", desc: "Yielding and obedient, finding pleasure in compliance." },
  { name: "Seductress", desc: "Seductively secretive, fueling curiosity and desire." },
  { name: "Cruel & Unforgiving", desc: "Harsh and ruthless, gives a darkly thrilling experience." },
  { name: "Free Spirited", desc: "Uninhibited and adventurous, passionately spontaneous." },
  { name: "Demanding Bully", desc: "Aggressive and uses power to get what they want." },
  { name: "Hopeless Romantic", desc: "Deeply passionate, cherishing emotional intimacy." },
  { name: "Insatiable", desc: "Unending lust, constantly demanding of your affection." },
  { name: "Shy & Innocent", desc: "Timid and sweet, easily flustered with a gentle charm." },
  { name: "Playful Tease", desc: "Witty and flirty, keeping things fun and lighthearted." },
  { name: "Intellectual", desc: "Thoughtful and eloquent, loves deep conversations." },
  { name: "Motherly", desc: "Warm and protective, offering comfort and guidance." },
  { name: "Tsundere", desc: "Cold on the surface but deeply caring underneath." },
  { name: "Yandere", desc: "Obsessively devoted with intense possessive love." },
];

export const STAGE_NAMES = ["Basic parameters", "Origin", "Facial", "Body type", "Personality", "Lifestyle", "Kinks", "Memories", "Final preview"];

export const STAGE_ICONS: Record<number, string> = {
  1: '<circle cx="5.333" cy="5.333" r="2.667" stroke="__CLR__" stroke-width="1.1"/><path d="M7.333 10A4 4 0 001 13.333" stroke="__CLR__" stroke-width="1.1"/><path d="M12 9c0 0 1.5 1 1.5 2.5S12 14 12 14s-1.5-1-1.5-2.5S12 9 12 9z" stroke="__CLR__" stroke-width="1.1"/>',
  2: '<path d="M8 1.333A5.333 5.333 0 002.667 6.667C2.667 10.667 8 14.667 8 14.667s5.333-4 5.333-8A5.333 5.333 0 008 1.333z" stroke="__CLR__" stroke-width="1.1"/><circle cx="8" cy="6.667" r="1.333" stroke="__CLR__" stroke-width="1.1"/>',
  3: '<circle cx="8" cy="8" r="5.333" stroke="__CLR__" stroke-width="1.1"/><path d="M5.5 9.5s1 1.5 2.5 1.5 2.5-1.5 2.5-1.5" stroke="__CLR__" stroke-width="1.1"/><circle cx="6" cy="6.5" r="0.5" fill="__CLR__"/><circle cx="10" cy="6.5" r="0.5" fill="__CLR__"/>',
  4: '<rect x="3.333" y="5" width="2.667" height="6" rx="1" stroke="__CLR__" stroke-width="1.1"/><rect x="10" y="5" width="2.667" height="6" rx="1" stroke="__CLR__" stroke-width="1.1"/><path d="M6 8h4" stroke="__CLR__" stroke-width="1.1" stroke-linecap="round"/><path d="M2 7v2" stroke="__CLR__" stroke-width="1.1" stroke-linecap="round"/><path d="M14 7v2" stroke="__CLR__" stroke-width="1.1" stroke-linecap="round"/>',
  5: '<path d="M14 7.667a5.667 5.667 0 01-.607 2.553A5.733 5.733 0 018.333 13.333a5.667 5.667 0 01-2.553-.606L2 14l1.273-3.78A5.667 5.667 0 012.667 7.667a5.733 5.733 0 013.113-5.06A5.667 5.667 0 018.333 2h.334A5.713 5.713 0 0114 7.333v.334z" stroke="__CLR__" stroke-width="1.1"/><path d="M6 7.333h.007M8.333 7.333h.007M10.667 7.333h.006" stroke="__CLR__" stroke-width="1.3" stroke-linecap="round"/>',
  6: '<circle cx="4" cy="10.5" r="2.5" stroke="__CLR__" stroke-width="1.1"/><circle cx="12" cy="10.5" r="2.5" stroke="__CLR__" stroke-width="1.1"/><path d="M4 10.5L6.5 5h2L12 10.5" stroke="__CLR__" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 5L8 10.5" stroke="__CLR__" stroke-width="1.1" stroke-linecap="round"/><path d="M5.5 4h3" stroke="__CLR__" stroke-width="1.1" stroke-linecap="round"/>',
  7: '<path d="M8 2C8 2 4 6 4 9.5C4 12 5.8 14 8 14s4-2 4-4.5C12 6 8 2 8 2z" stroke="__CLR__" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 14c-1.2 0-2.2-1-2.2-2.3 0-2 2.2-4 2.2-4s2.2 2 2.2 4c0 1.3-1 2.3-2.2 2.3z" stroke="__CLR__" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>',
  8: '<path d="M6 2L7.5 5.5 11 7l-3.5 1.5L6 12l-1.5-3.5L1 7l3.5-1.5L6 2z" stroke="__CLR__" stroke-width="1.1"/><path d="M12 8l.75 1.75L14.5 10.5l-1.75.75L12 13l-.75-1.75L9.5 10.5l1.75-.75L12 8z" stroke="__CLR__" stroke-width="1.1"/>',
  9: '<path d="M1.333 8S4 3.333 8 3.333 14.667 8 14.667 8 12 12.667 8 12.667 1.333 8 1.333 8z" stroke="__CLR__" stroke-width="1.1"/><circle cx="8" cy="8" r="2" stroke="__CLR__" stroke-width="1.1"/>',
};

export const CHEVRON_SVG = '<svg class="chevron" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="#969696" stroke-width="1.2"/></svg>';
export const GENERATE_BTN_SVG = '<svg class="icon" viewBox="0 0 16 16" fill="none"><path d="M6 2L7.5 5.5 11 7l-3.5 1.5L6 12l-1.5-3.5L1 7l3.5-1.5L6 2z" stroke="white" stroke-width="1.1"/><path d="M12 1l.75 1.75L14.5 3.5l-1.75.75L12 6l-.75-1.75L9.5 3.5l1.75-.75L12 1z" stroke="white" stroke-width="1.1"/></svg>';
export const VOICE_ICON_SVG = '<svg class="voice-icon" viewBox="0 0 16 16" fill="none"><path d="M7.333 2.667L4 5.333H2v5.334h2L7.333 13.333V2.667z" stroke="white" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.36 5.64a3.333 3.333 0 010 4.72" stroke="white" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const CHECK_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.333 8l3.334 3.333L12.667 5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const LOADER_SVG = '<svg class="loader-icon" viewBox="0 0 16 16" fill="none"><path d="M8 1.333V4" stroke="#969696" stroke-width="1.1" stroke-linecap="round"/><path d="M8 12v2.667" stroke="#969696" stroke-width="1.1" stroke-linecap="round"/><path d="M3.287 3.287l1.886 1.886" stroke="#969696" stroke-width="1.1" stroke-linecap="round"/><path d="M10.827 10.827l1.886 1.886" stroke="#969696" stroke-width="1.1" stroke-linecap="round"/><path d="M1.333 8H4" stroke="#969696" stroke-width="1.1" stroke-linecap="round"/><path d="M12 8h2.667" stroke="#969696" stroke-width="1.1" stroke-linecap="round"/><path d="M3.287 12.713l1.886-1.886" stroke="#969696" stroke-width="1.1" stroke-linecap="round"/><path d="M10.827 5.173l1.886-1.886" stroke="#969696" stroke-width="1.1" stroke-linecap="round"/></svg>';
export const PREMIUM_BADGE_SVG = '<div class="premium-badge"><svg viewBox="0 0 16 16" fill="none"><path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12l-1.5-3.5L3 7l3.5-1.5L8 2z" stroke="white" stroke-width="1.2"/></svg></div>';
