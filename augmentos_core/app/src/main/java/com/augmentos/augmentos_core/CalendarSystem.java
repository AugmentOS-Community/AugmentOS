package com.augmentos.augmentos_core;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.CalendarContract;
import android.util.Log;
import androidx.core.content.ContextCompat;
import android.Manifest;
import android.content.pm.PackageManager;

import com.augmentos.augmentos_core.augmentos_backend.ServerComms;

/**
 * CalendarSystem wraps interactions with the Android Calendar Provider.
 * It offers methods to query for calendar events—specifically the next upcoming event.
 */
public class CalendarSystem {

    private static final String TAG = "CalendarSystem";
    private static CalendarSystem instance;
    private Context context;

    // Calendar data tracking
    public CalendarItem latestCalendarItem = null;
    public CalendarItem latestAccessedCalendarItem = null;

    private final Handler calendarSendingLoopHandler = new Handler(Looper.getMainLooper());
    private Runnable calendarSendingRunnableCode;
    private final long calendarSendTime = 1000 * 60 * 10; // 5 minutes

    private final long firstFetchPollingInterval = 10000; // 5 seconds

    private CalendarSystem(Context context) {
        this.context = context.getApplicationContext();
        scheduleCalendarUpdates();
    }

    /**
     * Get the singleton instance of CalendarSystem
     *
     * @param context The application context
     * @return The singleton instance
     */
    public static synchronized CalendarSystem getInstance(Context context) {
        if (instance == null) {
            instance = new CalendarSystem(context);
        }
        return instance;
    }

    /**
     * Checks if the necessary calendar permissions are granted.
     *
     * @return true if permissions are granted.
     */
    private boolean hasCalendarPermissions() {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR)
                == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Request a calendar update from the system
     */
    public void requestCalendarUpdate() {
        if (!hasCalendarPermissions()) {
            Log.w(TAG, "Calendar permissions are not granted.");
            return;
        }

        Log.d(TAG, "Requesting calendar update.");

        // Fetch the next calendar event
        CalendarItem nextEvent = getNextUpcomingEvent();
        if (nextEvent != null) {
            latestCalendarItem = nextEvent;
            sendCalendarEventToServer();
        }
    }

    /**
     * Send the calendar event to the server if it's new
     */
    public void sendCalendarEventToServer() {
        CalendarItem calendarItem = getNewCalendarItem();

        if (calendarItem == null) return;

        ServerComms.getInstance().sendCalendarEvent(calendarItem);
    }

    /**
     * Get a new calendar item if available
     *
     * @return the new calendar item or null if nothing new
     */
    public CalendarItem getNewCalendarItem() {
        if (latestAccessedCalendarItem == latestCalendarItem || latestCalendarItem == null) return null;
        latestAccessedCalendarItem = latestCalendarItem;
        return latestAccessedCalendarItem;
    }

    /**
     * Retrieves the next upcoming event from the device's calendar.
     *
     * @return a CalendarItem representing the next upcoming event or null if none found.
     */
    private CalendarItem getNextUpcomingEvent() {
        if (!hasCalendarPermissions()) {
            Log.w(TAG, "Calendar permissions are not granted.");
            return null;
        }

        ContentResolver contentResolver = context.getContentResolver();
        String selection = CalendarContract.Events.DTSTART + " >= ?";
        String[] selectionArgs = new String[]{ String.valueOf(System.currentTimeMillis()) };
        String sortOrder = CalendarContract.Events.DTSTART + " ASC LIMIT 1";
        Uri eventsUri = CalendarContract.Events.CONTENT_URI;

        Cursor cursor = contentResolver.query(eventsUri, null, selection, selectionArgs, sortOrder);
        CalendarItem nextEvent = null;

        if (cursor != null) {
            if (cursor.moveToFirst()) {
                // Extract event details from the cursor
                long eventId = cursor.getLong(cursor.getColumnIndexOrThrow(CalendarContract.Events._ID));
                String title = cursor.getString(cursor.getColumnIndexOrThrow(CalendarContract.Events.TITLE));
                long dtStart = cursor.getLong(cursor.getColumnIndexOrThrow(CalendarContract.Events.DTSTART));
                long dtEnd = cursor.getLong(cursor.getColumnIndexOrThrow(CalendarContract.Events.DTEND));
                String timeZone = cursor.getString(cursor.getColumnIndexOrThrow(CalendarContract.Events.EVENT_TIMEZONE));

                nextEvent = new CalendarItem(eventId, title, dtStart, dtEnd, timeZone);
                Log.d(TAG, "Next event: " + nextEvent.toString());
            } else {
                Log.d(TAG, "No upcoming calendar events found.");
            }
            cursor.close();
        } else {
            Log.e(TAG, "Query to calendar content provider failed.");
        }

        return nextEvent;
    }

    /**
     * Schedule periodic calendar updates
     */
    public final void scheduleCalendarUpdates() {
        calendarSendingRunnableCode = new Runnable() {
            @Override
            public void run() {
                requestCalendarUpdate(); // Request calendar update
                calendarSendingLoopHandler.postDelayed(this, calendarSendTime);
            }
        };
        calendarSendingLoopHandler.postDelayed(calendarSendingRunnableCode, firstFetchPollingInterval);
    }
}