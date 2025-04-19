// import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Normalize a URL by removing trailing slashes
 * @param url The URL to normalize
 * @returns The normalized URL without trailing slashes
 */
export function normalizeUrl(url: string): string {
    if (!url) return url;
    
    // Remove trailing slashes
    return url.replace(/\/+$/, "");
}