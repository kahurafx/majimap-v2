import { TRPCError } from "@trpc/server";

/**
 * How far ahead of the server a device's clock may claim something happened.
 * A time far in the future would outrank everything real that follows it, so
 * an obviously wrong date is refused, but not a phone that's merely a little fast.
 */
const MAX_CLOCK_AHEAD_MS = 24 * 60 * 60 * 1000;

export function parseDeviceTime(value: string | undefined): Date {
    const when = value ? new Date(value) : new Date();
    if (when.getTime() > Date.now() + MAX_CLOCK_AHEAD_MS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That time is more than a day in the future — check the device's clock" });
    }
    return when;
}