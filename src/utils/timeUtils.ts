/**
 * Time utility functions for consistent EST timezone handling
 * All times in the application are stored and displayed in EST/EDT (America/New_York)
 */

const EST_TIMEZONE = 'America/New_York';

/**
 * Get current time as a Date object representing EST
 * This creates a Date that when converted to EST timezone will show the current EST time
 */
export function getCurrentESTTime(): Date {
  const now = new Date();
  // Get current time components in EST
  const estParts = now.toLocaleString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse: "MM/DD/YYYY, HH:MM:SS"
  const [datePart, timePart] = estParts.split(', ');
  const [month, day, year] = datePart.split('/').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);
  
  // Create a date string in local format (this will be interpreted as EST when we format it)
  const estDateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  // Get the offset between EST and UTC
  const estOffsetMs = getESTOffsetMs(now);
  
  // Create a UTC date that when displayed in EST will show the correct time
  // We need to subtract the offset to get a UTC time that represents the EST time
  const estDate = new Date(estDateString + 'Z'); // Parse as UTC
  const utcRepresentation = new Date(estDate.getTime() - estOffsetMs);
  
  return utcRepresentation;
}

/**
 * Get EST offset in milliseconds for a given date
 * Handles DST automatically (EST vs EDT)
 */
function getESTOffsetMs(date: Date): number {
  // Get the same moment in EST and UTC
  const estTimeString = date.toLocaleString('en-US', { 
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const utcTimeString = date.toLocaleString('en-US', { 
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse both to get the difference
  const [estDatePart, estTimePart] = estTimeString.split(', ');
  const [utcDatePart, utcTimePart] = utcTimeString.split(', ');
  
  const [estMonth, estDay, estYear] = estDatePart.split('/').map(Number);
  const [estHours, estMinutes, estSeconds] = estTimePart.split(':').map(Number);
  const estDate = new Date(estYear, estMonth - 1, estDay, estHours, estMinutes, estSeconds);
  
  const [utcMonth, utcDay, utcYear] = utcDatePart.split('/').map(Number);
  const [utcHours, utcMinutes, utcSeconds] = utcTimePart.split(':').map(Number);
  const utcDate = new Date(utcYear, utcMonth - 1, utcDay, utcHours, utcMinutes, utcSeconds);
  
  return estDate.getTime() - utcDate.getTime();
}

/**
 * Get current time in EST as ISO string
 * Returns an ISO string that when parsed and displayed in EST will show current EST time
 */
export function getCurrentESTISOString(): string {
  return getCurrentESTTime().toISOString();
}

/**
 * Convert a UTC ISO string (from frontend) to a Date object representing EST
 * The frontend estToUTC() function already converts EST to UTC correctly
 * So the UTC ISO string, when parsed and displayed in EST, will show the correct EST time
 * We just need to parse it and ensure it's treated correctly
 */
export function utcISOToESTDate(utcISOString: string): Date {
  // The frontend sends a UTC ISO string that represents an EST time
  // When we parse it, the Date object will correctly represent that time
  // When displayed in EST timezone, it will show the correct EST time
  const date = new Date(utcISOString);
  
  // Verify: get EST representation to ensure it matches what user entered
  // This is just for validation - the Date object itself is correct
  return date;
}

/**
 * Add hours to a date, working in EST timezone
 * Properly handles day/month/year rollovers and DST transitions
 */
export function addHoursEST(date: Date, hours: number): Date {
  // Get the EST representation of the date
  const estTimeString = date.toLocaleString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const [datePart, timePart] = estTimeString.split(', ');
  const [month, day, year] = datePart.split('/').map(Number);
  const [hoursStr, minutes, seconds] = timePart.split(':').map(Number);
  
  // Create a Date object using local time constructor (this handles rollovers automatically)
  // We'll treat this as EST time components
  const estDateLocal = new Date(year, month - 1, day, hoursStr, minutes, seconds);
  
  // Add hours (Date.setHours handles day/month/year rollovers automatically)
  estDateLocal.setHours(estDateLocal.getHours() + hours);
  
  // Extract the new date components (these are in local time, but represent EST)
  const newYear = estDateLocal.getFullYear();
  const newMonth = estDateLocal.getMonth() + 1;
  const newDay = estDateLocal.getDate();
  const newHours = estDateLocal.getHours();
  const newMinutes = estDateLocal.getMinutes();
  const newSeconds = estDateLocal.getSeconds();
  
  // Create new date string in EST format
  const newEstDateString = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}T${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}:${String(newSeconds).padStart(2, '0')}`;
  
  // Create a Date object representing this EST time
  // We need to create a UTC date that when displayed in EST shows the correct time
  // First, create a date at the EST time (treating it as UTC temporarily)
  const tempDate = new Date(newEstDateString + 'Z');
  
  // Get the offset for this new date (to handle DST correctly)
  const offsetMs = getESTOffsetMs(tempDate);
  
  // Adjust to get a UTC date that represents the EST time
  const resultDate = new Date(tempDate.getTime() - offsetMs);
  
  return resultDate;
}

