
/**
 * CSV Parser Module — CureBridge RCM Edition
 * Handles parsing and validation of CSV data for bulk doctor/provider lead imports
 */

// Header mapping: normalize various CSV header names to internal field names
const HEADER_MAP = {
  // Name variations
  "name": "name",
  "full name": "name",
  "first name": "name",
  "doctor name": "name",
  "dr name": "name",
  "provider name": "name",

  // Email variations
  "email": "email",
  "email address": "email",
  "e-mail": "email",

  // NPI variations
  "npi": "npi_number",
  "npi_number": "npi_number",
  "npi number": "npi_number",
  "npi#": "npi_number",

  // Phone variations
  "phone": "phone",
  "phone number": "phone",
  "phone_number": "phone",
  "tel": "phone",
  "telephone": "phone",

  // State
  "state": "state",

  // City
  "city": "city",

  // Website variations
  "website": "website",
  "url": "website",
  "site": "website",
  "web": "website",

  // Social Platform variations
  "social": "social_platform",
  "social_platform": "social_platform",
  "social platform": "social_platform",
  "social media": "social_platform",

  // Specialty variations
  "specialty": "specialty",
  "speciality": "specialty",
  "practice_type": "specialty",
  "practice type": "specialty",
  "specialization": "specialty",

  // Legacy fields (backward compatibility)
  "company": "company",
  "industry": "industry",
  "notes": "notes",
};

/**
 * Parse a single CSV line handling quoted fields with commas
 * @param {string} line
 * @returns {Array<string>}
 */
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse CSV string to JSON objects
 * @param {string} csvText 
 * @returns {Array<Object>} - Parsed leads
 */
export function parseCSVLeads(csvText) {
  if (!csvText || typeof csvText !== "string") return [];
  
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
  
  // Map headers to internal field names
  const mappedHeaders = headers.map(h => HEADER_MAP[h] || h);
  
  const leads = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const row = parseCSVLine(line);
    const lead = {};

    mappedHeaders.forEach((header, index) => {
      lead[header] = (row[index] || "").replace(/^["']|["']$/g, "");
    });
    
    if (lead.email) {
      leads.push({
        name: lead.name || "Unknown",
        email: lead.email,
        npi_number: lead.npi_number || "",
        phone: lead.phone || "",
        state: lead.state || "",
        city: lead.city || "",
        website: lead.website || "",
        social_platform: lead.social_platform || "",
        specialty: lead.specialty || "",
        // Legacy fields — keep for backward compatibility
        company: lead.company || "",
        industry: lead.industry || lead.specialty || "",
        notes: lead.notes || ""
      });
    }
  }

  return leads;
}

export default { parseCSVLeads };
