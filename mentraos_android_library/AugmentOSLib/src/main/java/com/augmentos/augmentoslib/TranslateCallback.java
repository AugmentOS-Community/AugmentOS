package com.augmentos.augmentoslib;

public interface TranslateCallback extends SubscriptionCallback {
    void call(String transcript, String languageCode, long timestamp, boolean isFinal, boolean foo);
}
