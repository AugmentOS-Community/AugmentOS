package com.teamopensmartglasses.augmentoslib.events;

import com.teamopensmartglasses.augmentoslib.AsrStreamType;

import java.io.Serializable;

public class StartAsrStreamRequestEvent implements Serializable {
    public String transcribeLanguage;
    public String translateLanguage;
    public final AsrStreamType asrStreamType;
    public String packageName;

    public static final String eventId = "startTranslationRequestEvent";

    public StartAsrStreamRequestEvent(String transcribeLanguage) {
        this.transcribeLanguage = transcribeLanguage;
        this.asrStreamType = AsrStreamType.TRANSCRIPTION;
    }

    public StartAsrStreamRequestEvent(String transcribeLanguage, String translateLanguage) {
        this.transcribeLanguage = transcribeLanguage;
        this.translateLanguage = translateLanguage;
        this.asrStreamType = AsrStreamType.TRANSLATION;
    }

    private StartAsrStreamRequestEvent(
            String transcribeLanguage,
            String translateLanguage,
            AsrStreamType asrStreamType,
            String packageName
    ) {
        this.transcribeLanguage = transcribeLanguage;
        this.translateLanguage = translateLanguage;
        this.asrStreamType = asrStreamType;
        this.packageName = packageName;
    }

    public StartAsrStreamRequestEvent withPackageName(String pkgName) {
        return new StartAsrStreamRequestEvent(
                this.transcribeLanguage,
                this.translateLanguage,
                this.asrStreamType,
                pkgName
        );
    }
}