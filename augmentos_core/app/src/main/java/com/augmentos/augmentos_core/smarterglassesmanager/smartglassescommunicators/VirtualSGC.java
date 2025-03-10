package com.augmentos.augmentos_core.smarterglassesmanager.smartglassescommunicators;

import android.content.Context;
import android.graphics.Bitmap;
import android.util.Log;

import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.GlassesBluetoothSearchDiscoverEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.TextToSpeechEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.SmartGlassesConnectionState;

import org.greenrobot.eventbus.EventBus;

public class VirtualSGC extends SmartGlassesCommunicator {
    private static final String TAG = "WearableAi_AndroidWearableSGC";


    Context context;
    SmartGlassesDevice smartGlassesDevice;

    public VirtualSGC(Context context, SmartGlassesDevice smartGlassesDevice){
        super();
        mConnectState = SmartGlassesConnectionState.DISCONNECTED;
        this.smartGlassesDevice = smartGlassesDevice;
    }

    public void setFontSizes(){
    }

    public void connectToSmartGlasses(){
        connectionEvent(SmartGlassesConnectionState.CONNECTED);
    }

    public void blankScreen(){
    }

    public void displayRowsCard(String[] rowStrings){

    }

    @Override
    public void destroy() {
        mConnectState = SmartGlassesConnectionState.DISCONNECTED;
        this.context = null;
        this.smartGlassesDevice = null;
        Log.d(TAG, "VirtualSGC destroyed successfully.");
    }


    public void displayReferenceCardSimple(String title, String body){}

    public void displayReferenceCardImage(String title, String body, String imgUrl){}

    public void displayBulletList(String title, String [] bullets){}

    public void displayBulletList(String title, String [] bullets, int lingerTime){}

    public void displayTextWall(String text){}
    public void displayDoubleTextWall(String textTop, String textBottom){}

    public void stopScrollingTextViewMode() {
    }

    public void startScrollingTextViewMode(String title){
    }

    public void scrollingTextViewIntermediateText(String text){
    }

    public void scrollingTextViewFinalText(String text){
    }

    public void showHomeScreen(){
    }

    public void displayPromptView(String prompt, String [] options){
    }

    public void displayTextLine(String text){}

    @Override
    public void displayBitmap(Bitmap bmp) {

    }

    @Override
    public void displayCustomContent(String json) {}

    @Override
    public void findCompatibleDeviceNames() {
        EventBus.getDefault().post(new GlassesBluetoothSearchDiscoverEvent(smartGlassesDevice.deviceModelName, "NOTREQUIREDSKIP"));
        this.destroy();
    }

    public void showNaturalLanguageCommandScreen(String prompt, String naturalLanguageArgs){}

    public void updateNaturalLanguageCommandScreen(String naturalLanguageArgs){}

    public void setFontSize(SmartGlassesFontSize fontSize){}
}