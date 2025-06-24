#!/usr/bin/env -S deno run --allow-read

import { parse } from "https://deno.land/std@0.224.0/csv/mod.ts";

interface StudentRecord {
  "Stu Legal First": string;
  "Stu Legal Last": string;
  "Stu Grad Yr": string;
}

async function main() {
  try {
    const csvContent = await Deno.readTextFile("real_data.csv");
    const records = parse(csvContent, { skipFirstRow: true }) as StudentRecord[];
    
    console.log("Email Format Length Analysis:");
    console.log("=" .repeat(80));
    console.log("Format comparisons: four-digit vs two-digit with dot separator");
    console.log("");
    
    for (const record of records) {
      const firstName = record["Stu Legal First"]?.trim().toLowerCase().replace(/[^a-z]/g, '') || "";
      const lastName = record["Stu Legal Last"]?.trim().toLowerCase().replace(/[^a-z]/g, '') || "";
      const gradYear = record["Stu Grad Yr"]?.trim() || "";
      
      if (firstName && lastName && gradYear) {
        // Current format: firstname.lastname2025@domain.edu
        const currentFormat = `${firstName}.${lastName}${gradYear}@school.edu`;
        
        // New format: firstname.lastname.25@domain.edu
        const twoDigitYear = gradYear.slice(-2);
        const newFormat = `${firstName}.${lastName}.${twoDigitYear}@school.edu`;
        
        const currentLength = currentFormat.length;
        const newLength = newFormat.length;
        const savings = currentLength - newLength;
        
        console.log(`${firstName} ${lastName} (${gradYear}):`);
        console.log(`  Current: ${currentFormat} (${currentLength} chars)`);
        console.log(`  New:     ${newFormat} (${newLength} chars) [saves ${savings} chars]`);
        console.log("");
      }
    }
  } catch (error) {
    console.error("Error reading CSV file:", error.message);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}