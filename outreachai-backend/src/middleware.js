/**
 * Express Middleware Module — Security Hardened
 * Handles API auth, input sanitization, rate limiting, logging, and error handling
 */
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

// ===== ENCRYPTION UTILS =====
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
const IV_LENGTH = 16;

export function encrypt(text) {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY, "hex"), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
  } catch { return text; }
}

export function decrypt(text) {
  if (!text || !text.includes(":")) return text;
  try {
    const parts = text.split(":");
    if (parts.length !== 2) return text;
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = Buffer.from(parts[1], "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY, "hex"), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch { return text; }
}

// ===== INPUT SANITIZATION =====
export function sanitize(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[<>"'&]/g, (char) => {
    const map = { "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "&": "&amp;" };
    return map[char] || char;
  }).trim().slice(0, 2000);
}

/** Sanitize all string fields in req.body */
export function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === "object") {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === "string") {
        req.body[key] = sanitize(req.body[key]);
      }
    }
  }
  next();
}

// ===== REQUEST LOGGER (no sensitive data) =====
export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const elapsed = Date.now() - start;
    const path = req.originalUrl.split("?")[0]; // Strip query params from logs
    console.log(`[${new Date().toISOString()}] ${req.method} ${path} - ${res.statusCode} (${elapsed}ms)`);
  });
  next();
}

// ===== API KEY AUTHENTICATION =====
export function authenticateAPI(req, res, next) {
  // Health check is public
  if (req.path === "/api/health") return next();
  
  const apiKey = req.headers["x-api-key"] || req.query.api_key;
  const envKey = process.env.API_KEY;

  if (!envKey) return next(); // No key configured = dev mode
  if (!apiKey || apiKey !== envKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ===== CUSTOM SECURITY HEADERS =====
export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

// ===== STRIP SENSITIVE DATA FROM RESPONSES =====
export function stripPasswords(data) {
  if (!data) return data;
  if (Array.isArray(data)) return data.map(stripPasswords);
  if (typeof data === "object") {
    const clean = { ...data };
    delete clean.app_password;
    delete clean.password;
    return clean;
  }
  return data;
}

// ===== INPUT LENGTH VALIDATORS =====
export const INPUT_LIMITS = {
  name: 100,
  email: 255,
  company: 200,
  notes: 1000,
  npi_number: 10,
  phone: 20,
  state: 50,
  city: 50,
  website: 500,
  social_platform: 50,
  specialty: 100,
  industry: 100,
};

export function validateInputLengths(req, res, next) {
  if (req.body && typeof req.body === "object") {
    for (const [field, maxLen] of Object.entries(INPUT_LIMITS)) {
      if (req.body[field] && typeof req.body[field] === "string" && req.body[field].length > maxLen) {
        req.body[field] = req.body[field].slice(0, maxLen);
      }
    }
    // NPI must be digits only (if provided)
    if (req.body.npi_number && req.body.npi_number.length > 0) {
      req.body.npi_number = req.body.npi_number.replace(/\D/g, "").slice(0, 10);
    }
  }
  next();
}

// ===== ERROR HANDLER (no stack traces in production) =====
export function errorHandler(err, req, res, _next) {
  console.error("❌ API Error:", err.message);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "production" ? "Please contact support" : err.message
  });
}

// ===== EMAIL VALIDATION =====
export function validateEmail(req, res, next) {
  const { email } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email && !emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  next();
}

export default { requestLogger, authenticateAPI, errorHandler, validateEmail, sanitizeBody, securityHeaders, stripPasswords, validateInputLengths, encrypt, decrypt, sanitize };
