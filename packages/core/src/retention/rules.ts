import {
  KIT_RETENTION_MONTHS,
  PHOTO_RETENTION_DAYS,
  RETENTION_PURGE_INTERVAL_HOURS,
} from "#src/constants.ts";

const MILLISECONDS_PER_DAY = 86_400_000;
const MILLISECONDS_PER_HOUR = 3_600_000;

export function photoDeleteDeadline(insertDatetime: Date): Date {
  return new Date(insertDatetime.getTime() + PHOTO_RETENTION_DAYS * MILLISECONDS_PER_DAY);
}

export function kitDeleteDeadline(publishedDatetime: Date): Date {
  const deadline = new Date(publishedDatetime.getTime());
  deadline.setUTCMonth(deadline.getUTCMonth() + KIT_RETENTION_MONTHS);
  return deadline;
}

export function isPhotoExpired(insertDatetime: Date, now: Date): boolean {
  return photoDeleteDeadline(insertDatetime).getTime() <= now.getTime();
}

export function isPhotoDueForPurge(insertDatetime: Date, now: Date): boolean {
  const nextPurgeDatetime = now.getTime() + RETENTION_PURGE_INTERVAL_HOURS * MILLISECONDS_PER_HOUR;
  return photoDeleteDeadline(insertDatetime).getTime() <= nextPurgeDatetime;
}

export function isKitExpired(publishedDatetime: Date, now: Date): boolean {
  return kitDeleteDeadline(publishedDatetime).getTime() <= now.getTime();
}
