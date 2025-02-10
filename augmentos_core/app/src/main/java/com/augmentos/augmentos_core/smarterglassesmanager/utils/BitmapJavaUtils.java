package com.augmentos.augmentos_core.smarterglassesmanager.utils;

import java.io.File;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Log;

public class BitmapJavaUtils {
    private static final String TAG = "WearableAi_BitmapJavaUtils";

    public static Bitmap loadImageFromStorage(String path){
        File imgFile = new  File(path);
        if(imgFile.exists()){
            Bitmap myBitmap = BitmapFactory.decodeFile(imgFile.getAbsolutePath());
            return myBitmap;
        } else {
            Log.d(TAG, "Image doesn't exist");
            return null;
        }
    }
}
