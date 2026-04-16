/**
 * category-map.ts
 *
 * Maps GBP primary categories to citation platforms.
 * Focused on US Healthcare & Wellness businesses.
 *
 * The 11 citation platforms checked for every healthcare audit:
 *  1. Google Business Profile
 *  2. Healthgrades
 *  3. Yelp
 *  4. Zocdoc
 *  5. WebMD
 *  6. Vitals
 *  7. CareDash
 *  8. RateMDs
 *  9. Apple Maps
 * 10. Meta (Facebook)
 * 11. Advice Local (aggregator)
 */

import type { CitationCategory } from "@/types";

export interface HealthcareCategoryMapping {
  category: CitationCategory;
  gbpCategories: string[];
  specialties: string[];
}

/**
 * Healthcare & Wellness GBP category mappings.
 * Used to refine keyword generation and AI insights.
 */
export const HEALTHCARE_CATEGORY_MAP: HealthcareCategoryMapping[] = [
  {
    category: "healthcare",
    gbpCategories: [
      "Dentist", "Orthodontist", "Oral Surgeon", "Periodontist", "Endodontist",
      "Pediatric Dentist", "Prosthodontist", "Dental Clinic", "Cosmetic Dentist",
      "Doctor", "Physician", "Family Practice Physician", "Internal Medicine Physician",
      "Pediatrician", "Dermatologist", "Cardiologist", "Orthopedic Surgeon",
      "Neurologist", "Psychiatrist", "Psychologist", "Ophthalmologist", "Optometrist",
      "Urologist", "Gastroenterologist", "Pulmonologist", "Oncologist",
      "ENT Doctor", "Otolaryngologist", "Allergist", "Rheumatologist",
      "Podiatrist", "Gynecologist", "Obstetrician", "OB/GYN",
      "Surgeon", "Plastic Surgeon", "General Surgeon", "Vascular Surgeon",
      "Pain Management Specialist", "Anesthesiologist",
      "Radiologist", "Pathologist", "Nephrologist", "Endocrinologist",
      "Hematologist", "Infectious Disease Specialist",
      "Sports Medicine Physician", "Geriatrician",
      "Hospital", "Medical Center", "Clinic", "Urgent Care Center",
      "Emergency Room", "Medical Group", "Health System",
      "Ambulatory Surgery Center", "Dialysis Center", "Imaging Center",
      "Laboratory", "Blood Bank",
      "Pharmacy", "Compounding Pharmacy",
      "Chiropractor", "Physical Therapist", "Physical Therapy Clinic",
      "Occupational Therapist", "Speech Therapist", "Speech Pathologist",
      "Acupuncturist", "Massage Therapist", "Naturopathic Practitioner",
      "Nutritionist", "Dietitian", "Health Coach",
      "Mental Health Clinic", "Counselor", "Therapist",
      "Addiction Treatment Center", "Rehabilitation Center",
      "Medical Spa", "Wellness Center", "Weight Loss Service",
      "Home Health Care Service", "Nursing Home", "Assisted Living Facility",
      "Veterinarian", "Animal Hospital",
      "Midwife", "Doula", "Lactation Consultant",
    ],
    specialties: [
      "dentistry", "orthodontics", "oral surgery", "periodontics",
      "family medicine", "internal medicine", "pediatrics", "dermatology",
      "cardiology", "orthopedics", "neurology", "psychiatry", "psychology",
      "ophthalmology", "optometry", "urology", "gastroenterology",
      "pulmonology", "oncology", "ENT", "allergy", "rheumatology",
      "podiatry", "obstetrics", "gynecology", "surgery",
      "plastic surgery", "pain management", "sports medicine",
      "chiropractic", "physical therapy", "occupational therapy",
      "speech therapy", "acupuncture", "massage therapy", "naturopathy",
      "nutrition", "mental health", "counseling", "wellness",
      "urgent care", "emergency medicine", "pharmacy",
    ],
  },
];

/**
 * Check if a GBP primary category falls within healthcare & wellness.
 */
export function isHealthcareCategory(gbpCategory: string): boolean {
  const lower = gbpCategory.toLowerCase();
  return HEALTHCARE_CATEGORY_MAP[0].gbpCategories.some(
    (c) => lower.includes(c.toLowerCase()) || c.toLowerCase().includes(lower)
  );
}

/**
 * Get the citation category for a GBP primary category string.
 * For this US Healthcare-focused tool, always returns "healthcare".
 */
export function getCitationCategory(_gbpCategory: string): CitationCategory {
  return "healthcare";
}

/**
 * Get healthcare specialties that match the GBP category.
 * Useful for refining AI insights and recommendations.
 */
export function getMatchingSpecialties(gbpCategory: string): string[] {
  const lower = gbpCategory.toLowerCase();
  return HEALTHCARE_CATEGORY_MAP[0].specialties.filter(
    (s) => lower.includes(s) || s.includes(lower)
  );
}
