import fs from "fs/promises";
import { glob } from "glob";
import { curly } from "node-libcurl";
import { convert, revert } from "url-slug";
import yaml from "js-yaml";
import sharp from "sharp";
import { MONTH_MAP } from "./constants.js";

export const ONGOING_TASKS = [];
const __dirname = import.meta.dirname;
const dictionary = {
  "&": "and",
  "@": "at",
  "#": "number",
  "%": "percent",
  "+": "plus",
  "’": "", // For possessives or contractions (e.g., "Bob’s")
  "!": "",
  é: "e", // Common in cuisine-related names
  ñ: "n", // For Spanish-influenced names
  "(": "", // For parenthetical info
  ")": "",
  ".": "dot", // For abbreviations or stylized names
};

String.prototype.truncate = function (numChars, elipsis = true) {
  let text = this;
  if (text.length <= numChars) {
    return text;
  } else {
    const endIndex = elipsis ? 3 : 0;
    text = text.slice(0, numChars - endIndex);
    text += elipsis ? "..." : "";
    return text;
  }
};

export async function findFileNameByPrefix(directory, prefix) {
  try {
    const files = await fs.readdir(directory); // List all files in the directory
    const matchingFile = files.find((file) => file.startsWith(prefix)); // Find the file with the prefix
    return matchingFile ? matchingFile : null; // Return the file name if found
  } catch (error) {
    console.error("Error reading directory:", error);
    return null;
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateRandomString(length = 256) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";
  let result = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }
  return result;
}

export async function downloadImage(imageUrl, filePath) {
  const { statusCode, data, headers } = await curly.get(imageUrl);

  console.log("downloadImage() statusCode:", statusCode);
  // console.log('Download data:', JSON.stringify(data, null, 2))
  // console.log('Download headers:', JSON.stringify(headers, null, 2))

  const match = headers[0]["content-type"].match(/.+\/(.+)$/);
  const fileExt = match ? `.${match[1]}` : ".unknown";
  filePath += fileExt;

  await fs.writeFile(filePath, data);

  // Use sharp to get image dimensions
  const metadata = await sharp(filePath).metadata();
  // console.log('Sharp metadata:', JSON.stringify(metadata, null, 2))
  console.log(`Image dimensions: ${metadata.width}x${metadata.height}`);
  return { path: filePath, width: metadata.width, height: metadata.height };
}

export function getTimestamp() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
  const day = String(now.getDate()).padStart(2, "0");

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const milliseconds = String(now.getMilliseconds()).padStart(3, "0");

  // Combine into the desired format
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export function camelToSnakeCase(str) {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

export function slugify(name) {
  if (!name || typeof name !== "string") return "";
  return convert(name.toLowerCase());
}

export function deslugify(slug) {
  if (!slug || typeof slug !== "string") return "";
  return revert(slug.trim());
}

export function registerShutdown(saveDataCbs) {
  process.on("SIGINT", () => {
    console.log("Received SIGINT. Shutting down gracefully...");
    shutdown(saveDataCbs);
  });

  process.on("SIGTERM", () => {
    console.log("Received SIGTERM. Shutting down gracefully...");
    shutdown(saveDataCbs);
  });

  process.on("beforeExit", async () => {
    console.log("Process is about to exit. Shutting down gracefully...");
    const unsavedPlacesCb = saveDataCbs.find(
      (el) => el.unsavedPlaces?.length > 0
    );
    if (unsavedPlacesCb) {
      console.log("Unsaved places detected. Saving before exit...");
      try {
        // Convert object to JSON string with indentation
        const jsonString = JSON.stringify(
          unsavedPlacesCb.unsavedPlaces,
          null,
          2
        );
        const filepath = "unsavedPlaces.json";
        await fs.writeFile(filepath, jsonString);
        console.log(`unsavedPlaces saved to ${filepath}`);
      } catch (error) {
        console.error(`Error saving object to ${filePath}:`, error);
      }

      // await fileIO.wr //unsavedPlacesCb.cb(unsavedPlacesCb.unsavedPlaces)
    }
    process.exit(0);
  });
}

export async function shutdown(saveDataCbs) {
  try {
    // upsert data before exit
    if (Array.isArray(saveDataCbs) || saveDataCbs.length > 0) {
      await saveDataCbs.forEach(async ({ data, cb }) => await cb(data));
    }

    // Exit the process
    console.log("Process exited gracefully.");
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1); // Exit with an error code
  }
}

export function instancesEqualExcluding(obj1, obj2, excludedProperty) {
  for (const prop in obj1) {
    if (Object.hasOwn(obj1, prop) && prop !== excludedProperty) {
      if (!Object.hasOwn(obj2, prop) || obj1[prop] !== obj2[prop]) {
        return false;
      }
    }
  }
  for (const prop in obj2) {
    if (Object.hasOwn(obj2, prop) && prop !== excludedProperty) {
      if (!Object.hasOwn(obj1, prop)) {
        return false;
      }
    }
  }
  return true;
}

export async function cleanDir(dir) {
  try {
    const pathnames = await glob(dir);
    for (const pathname of pathnames) {
      await fs.rm(pathname, { recursive: true, force: true });
    }
    console.log(`Cleaned directory ${dir}`);
  } catch (error) {
    console.error(`Error removing files: ${error}`);
  }
}

export function objToYaml(object, globalIndent = 2) {
  function rplcr(key, value) {
    if (typeof value === "string" && value.includes(":")) {
      return `"${value}"`;
    }
    return value;
  }
  const yamlString = yaml.dump(object);
  const spaces = globalIndent > 0 ? " ".repeat(globalIndent) : "";
  const indentedYaml = yamlString
    .split("\n")
    .map((line) => {
      return line ? spaces + line : line;
    })
    .join("\n");
  return indentedYaml;
}

export function getCurrMthYr() {
  const month = MONTH_MAP[new Date().getMonth()];
  const year = new Date().getFullYear();
  return `${month}_${year}`;
}

export function extractId(str, type) {
  const types = ["reviews", "photos", "places"];
  if (!types.some((item) => str.includes(item))) return null;
  const regStr = `.*${type}\/([^\/]*)\/*.*`;
  const regexp = new RegExp(regStr, "g");
  const array = [...str.matchAll(regexp)];
  return array[0]?.[1] ?? null;
}

export function dedupeArray(arr, key) {
  const seen = new Set();
  return arr.filter((obj) => {
    const keyValue = obj[key];
    return seen.has(keyValue) ? false : (seen.add(keyValue), true);
  });
}

export function timestamp() {
  const ts = Date.now();
  const date = new Date(ts);
  let isoDate = date.toISOString();
  return isoDate.replace("T", " ").replace("Z", "");
}

// Function to calculate surrounding lat/long coordinates for a given center and radius
export function calcSurroundingCoords(latitude, longitude, radius) {
  // Earth's radius in meters
  const EARTH_RADIUS = 6371000;

  // Convert radius to radians (angular distance)
  const radiusInRadians = radius / EARTH_RADIUS;

  // Distance to surrounding points (approx sqrt(3) * radius for hexagonal packing)
  const distance = 1.732 * radius;
  const distanceInRadians = distance / EARTH_RADIUS;

  // Array to store new coordinates
  const surroundingCoords = [];

  // Calculate 6 surrounding points (hexagonal arrangement at 0°, 60°, 120°, 180°, 240°, 300°)
  for (let i = 0; i < 6; i++) {
    const bearing = (i * 60 * Math.PI) / 180; // Convert degrees to radians

    // Calculate new latitude
    const newLat =
      (Math.asin(
        Math.sin((latitude * Math.PI) / 180) * Math.cos(distanceInRadians) +
          Math.cos((latitude * Math.PI) / 180) *
            Math.sin(distanceInRadians) *
            Math.cos(bearing)
      ) *
        180) /
      Math.PI;

    // Calculate new longitude
    const newLon =
      longitude +
      (Math.atan2(
        Math.sin(bearing) *
          Math.sin(distanceInRadians) *
          Math.cos((latitude * Math.PI) / 180),
        Math.cos(distanceInRadians) -
          Math.sin((latitude * Math.PI) / 180) *
            Math.sin((newLat * Math.PI) / 180)
      ) *
        180) /
        Math.PI;

    surroundingCoords.push({ latitude: newLat, longitude: newLon });
  }

  return surroundingCoords;
}
