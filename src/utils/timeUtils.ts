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
 * Add hours to a date, working in EST timezone
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
  
  // Add hours in EST
  const newHours = hoursStr + hours;
  
  // Create new date string in EST
  const newEstDateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(newHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  // Create a temporary date to get the offset
  const tempDate = new Date(newEstDateString + 'Z');
  const offsetMs = getESTOffsetMs(tempDate);
  const resultDate = new Date(tempDate.getTime() - offsetMs);
  
  return resultDate;
}

