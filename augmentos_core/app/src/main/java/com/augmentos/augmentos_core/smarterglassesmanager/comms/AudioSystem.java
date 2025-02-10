package com.augmentos.augmentos_core.smarterglassesmanager.comms;

import android.media.AudioFormat;

import android.util.Base64;

import io.reactivex.rxjava3.disposables.Disposable;
import io.reactivex.rxjava3.subjects.PublishSubject;

import java.io.IOException;

import org.greenrobot.eventbus.EventBus;
import org.json.JSONObject;
import org.json.JSONException;

import android.content.Context;

import java.util.Random;
import java.nio.ByteOrder;

import android.os.Handler;
import android.os.HandlerThread;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.io.DataOutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.io.DataInputStream;
import java.net.ServerSocket;
import java.net.Socket;

import android.util.Log;

import com.augmentos.augmentos_core.R;
import com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages.AudioChunkNewEvent;
import com.augmentos.augmentos_core.smarterglassesmanager.utils.AES;

public class AudioSystem {
    private static String TAG = "WearableAi_AudioSystem";

    private boolean shouldDie;

    private String secretKey;

    // the audio recording options - same on ASG
    private static final int RECORDING_RATE = 16000;
    private static final int CHANNEL = AudioFormat.CHANNEL_IN_MONO;
    private static final int FORMAT = AudioFormat.ENCODING_PCM_16BIT;

    //Thread to receive audio from ASG
    //socket info
    static int PORT = 4449;
    private static int mConnectState = 0;
    final byte [] ack_id = {0x13, 0x37};
    final byte [] heart_beat_id = {0x19, 0x20};
    final byte [] img_id = {0x01, 0x10}; //id for images

    //handle heart beat stuff
    private static long lastHeartbeatTime;
    private static int heartbeatInterval = 3000; //milliseconds
    private static int heartbeatPanicX = 3; // number of intervals before we reset connection
    static Thread HeartbeatThread = null;
    private  int outbound_heart_beats = 0;

    //socket data
    static Thread SocketThread = null;
    static Thread ReceiveThread = null;
    static Thread SendThread = null;
    //i/o
    private  DataOutputStream output;
    private  DataInputStream input;

    //our actual socket connection object
    ServerSocket serverSocket;
    private static Socket socket;

    //send audio to to other services in the app
    PublishSubject<JSONObject> dataObservable;
    Disposable dataSubscriber;

    Context context;

    public AudioSystem(Context context, PublishSubject<JSONObject> dataObservable){
        this.context = context;

        //set the key for encryption
        secretKey = context.getResources().getString(R.string.key);

        this.dataObservable = dataObservable;
        dataSubscriber = dataObservable.subscribe(i -> handleDataStream(i));
    }


    //send_queue of data to send through the socket
    private  BlockingQueue<byte []> send_queue;

    public void startAudio(){
        //make a new queue to hold data to send
        send_queue = new ArrayBlockingQueue<byte[]>(50);

        //start the socket thread which will send the raw audio data
        startSocket();
    }

    public void startSocket(){
        //start first socketThread
        if (socket == null) {
            mConnectState = 1;
            SocketThread = new Thread(new SocketThread());
            SocketThread.start();

            //setup handler to handle keeping connection alive, all subsequent start of SocketThread
            //start a new handler thread to send heartbeats
            HandlerThread thread = new HandlerThread("HeartBeater");
            thread.start();
            Handler heart_beat_handler = new Handler(thread.getLooper());
            final int hb_delay = 3000;
            final int min_hb_delay = 1000;
            final int max_hb_delay = 2000;
            Random rand = new Random();
            heart_beat_handler.postDelayed(new Runnable() {
                public void run() {
                    heartBeat();
                    //random hb_delay for heart beat so as to disallow synchronized failure between client and server
                    int random_hb_delay = rand.nextInt((max_hb_delay - min_hb_delay) + 1) + min_hb_delay;
                    heart_beat_handler.postDelayed(this, random_hb_delay);
                }
            }, hb_delay);
        }
    }


        //heart beat checker - check if we have received a heart rate
//    private void heartBeat(){
//        //check if we are still connected.
//        //if not , reconnect,
//        //we don't need to actively send heart beats from the client, as it's assumed that we are ALWAYS streaming data. Later, if we have periods of time where no data is sent, we will want to send a heart beat perhaps. but the client doesn't really need to, we just need to check if we are still connected
//        if (mConnectState == 0) {
//            restartSocket();
//        }
//
//        //or, if haven't been receiving heart beats, restart socket
//        if (mConnectState == 2) {
//            if ((System.currentTimeMillis() - lastHeartbeatTime) > (heartbeatInterval * heartbeatPanicX)) {
//                Log.d(TAG, "DIDN'T RECEIVE HEART BEATS, RESTARTING SOCKET");
//                mConnectState = 0;
//                restartSocket();
//            }
//        }
//    }
//
    private void heartBeat(){
        //check if we are still connected.
        //if not , reconnect,
        //if we are connected, send a heart beat to make sure we are still connected
        if ((mConnectState == 0) && (shouldDie == false)) {
            restartSocket();
        } else if (mConnectState == 2){
            //make sure we don't have a ton of outbound heart beats unresponded to
            //reimplement this later -- ASG needs to receive heart beats
//            if (outbound_heart_beats > 5) {
//                restartSocket();
//                return;
//            }
//
//            //increment counter
//            outbound_heart_beats++;
//
//            //send heart beat
//            sendBytes(heart_beat_id, null);
        }
    }



//    public static void restartSocket() {
//        Log.d(TAG, "Restarting socket");
//        mConnectState = 1;
//        if (socket != null && (!socket.isClosed())){
//            try {
//                output.close();
//                input.close();
//                socket.close();
//            } catch (IOException e) {
//                System.out.println("FAILED TO CLOSE SOCKET, SOMETHING IS WRONG");
//            }
//        }
//
//
//        //restart socket thread
//        Log.d(TAG, "starting socket");
//        SocketThread = new Thread(new SocketThread());
//        SocketThread.start();
//    }
//
    private void restartSocket(){
        Log.d(TAG, "Running restart socket");
        mConnectState = 1;

        outbound_heart_beats = 0;

        //close the previous socket now that it's broken/being restarted
        killSocket();

        //make sure socket thread has joined before throwing off a new one
        try {
            Log.d(TAG, "Waiting socket thread join");
            SocketThread.join();
            Log.d(TAG, "Socket thread joined");
        } catch (InterruptedException e){
            e.printStackTrace();
        }

        //start a new socket thread
        SocketThread = new Thread(new SocketThread());
        SocketThread.start();
    }

    private void killSocket(){
        try {
            if (serverSocket != null && (!serverSocket.isClosed())) {
                Log.d(TAG, "Closing socket, input, serverSocket, etc.");
                serverSocket.close();
            }
            if (socket != null){
                socket.close();
            }
            if (output != null){
                output.close();
            }
            if (input != null){
                input.close();
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }



//    static class SocketThread implements Runnable {
//        public void run() {
//            try {
//                serverSocket = new ServerSocket(PORT);
//                try {
//                    socket = serverSocket.accept();
//    //                System.out.println("TRYING TO CONNECT AUDIO STREAM ASG");
//    //                socket = new Socket(SERVER_IP, SERVER_PORT);
//                    lastHeartbeatTime = System.currentTimeMillis();
//                    System.out.println("GLBOX CONNECTED!");
//                    //output = new DataOutputStream(socket.getOutputStream());
//                    //input = new BufferedReader(new InputStreamReader(socket.getInputStream()));
//                    input = new DataInputStream(new DataInputStream(socket.getInputStream()));
//                    mConnectState = 2;
//                    //make the threads that will send and receive
//                    if (ReceiveThread == null) { //if the thread is null, make a new one (the first one)
//                        ReceiveThread = new Thread(new ReceiveThread());
//                        ReceiveThread.start();
//                    } else if (!ReceiveThread.isAlive()) { //if the thread is not null but it's dead, let it join then start a new one
//                        Log.d(TAG, "IN SocketThread, WAITING FOR receive THREAD JOING");
//                        try {
//                            ReceiveThread.join(); //make sure socket thread has joined before throwing off a new one
//                        } catch (InterruptedException e) {
//                            e.printStackTrace();
//                        }
//                        Log.d(TAG, "receive JOINED");
//                        ReceiveThread = new Thread(new ReceiveThread());
//                        ReceiveThread.start();
//                    }
//                } catch(IOException e){
//                    e.printStackTrace();
//                    mConnectState = 0;
//                }
//            } catch (IOException e) {
//                Log.d(TAG, "Connection Refused on socket");
//                e.printStackTrace();
//                mConnectState = 0;
//            }
//        }
//    }
//
    class SocketThread implements Runnable {
        @Override
        public void run() {
            try {
                Log.d(TAG, "Starting new socket, waiting for connection...");
                serverSocket = new ServerSocket(PORT);
                try {
                    socket = serverSocket.accept();
                    socket.setSoTimeout(3000);
                    Log.d(TAG, "Got socket connection.");
                    //output = new PrintWriter(socket.getOutputStream(), true);
                    output = new DataOutputStream(socket.getOutputStream());
                    input = new DataInputStream(new DataInputStream(socket.getInputStream()));
                    mConnectState = 2;
                    if (ReceiveThread == null) { //if the thread is null, make a new one (the first one)
                        ReceiveThread = new Thread(new ReceiveThread());
                        ReceiveThread.start();
                    } else if (!ReceiveThread.isAlive()) { //if the thread is not null but it's dead, let it join then start a new one
                        try {
                            ReceiveThread.join(); //make sure socket thread has joined before throwing off a new one
                        } catch (InterruptedException e) {
                            e.printStackTrace();
                        }
                        ReceiveThread = new Thread(new ReceiveThread());
                        ReceiveThread.start();
                    }
                    if (SendThread == null) { //if the thread is null, make a new one (the first one)
                    SendThread = new Thread(new SendThread());
                    SendThread.start();
                } else if (!SendThread.isAlive()) { //if the thread is not null but it's dead, let it join then start a new one
                    try {
                        SendThread.join(); //make sure socket thread has joined before throwing off a new one
                    } catch (InterruptedException e) {
                        e.printStackTrace();
                    }
                    SendThread =  new Thread(new SendThread());
                    SendThread.start();
                }
                } catch (IOException e) {
                    e.printStackTrace();
                    mConnectState = 0;
                }
            } catch (IOException e) {
                e.printStackTrace();
                mConnectState = 0;
            }
        }
    }


    public void sendBytes(byte[] id, byte [] data){
        //first, send hello
        byte [] hello = {0x01, 0x02, 0x03};
        //then send length of body
        byte[] len;
        if (data != null) {
             len = my_int_to_bb_be(data.length);
        } else {
            len = my_int_to_bb_be(0);
        }
        //then send id of message type
        byte [] msg_id = id;
        //then send data
        byte [] body = data;
        //then send end tag - eventually make this unique to the image
        byte [] goodbye = {0x3, 0x2, 0x1};
        //combine those into a payload
        ByteArrayOutputStream outputStream;
        try {
            outputStream = new ByteArrayOutputStream();
            outputStream.write(hello);
            outputStream.write(len);
            outputStream.write(msg_id);
            if (body != null) {
                outputStream.write(body);
            }
            outputStream.write(goodbye);
        } catch (IOException e){
            mConnectState = 0;
            return;
        }
        byte [] payload = outputStream.toByteArray();

        //send it in a background thread
        //new Thread(new SendThread(payload)).start();
        send_queue.add(payload);
    }

    //this sends messages
     class SendThread implements Runnable {
        SendThread() {
        }
        @Override
        public void run() {
            send_queue.clear();
            while (true){
                if (mConnectState != 2){
                    break;
                }
                if (send_queue.size() > 10){
                    break;
                }
                byte [] data;
                try {
                    data = send_queue.take(); //block until there is something we can pull out to send
                } catch (InterruptedException e){
                    e.printStackTrace();
                    break;
                }
                try {
                    output.write(data);           // write the message
                } catch (IOException e) {
                    e.printStackTrace();
                    break;
                }
            }
            throwBrokenSocket();
        }
    }

    //receives messages
    private class ReceiveThread implements Runnable {
        @Override
        public void run() {
            //System.out.println("Receive Started, mconnect: " + mConnectState);
            while (true) {
                if (mConnectState != 2){
                    break;
                }
                try {
                    int chunk_len = 6416; //until we use a better protocol to specify start and end of packet, we need to to match the number in asg
                    byte [] raw_data = new byte[chunk_len];
                    input.readFully(raw_data, 0, chunk_len); // read the body
                    EventBus.getDefault().post(new AudioChunkNewEvent(raw_data));
                    //byte [] plain_audio_bytes = decryptBytes(raw_data);
                    //dataObservable.onNext(plain_audio_bytes);
                } catch (IOException e) {
                    Log.d(TAG, "Audio service receive thread broken.");
                    e.printStackTrace();
                    break;
                }
            }
            throwBrokenSocket();
        }
    }

    public byte[] my_int_to_bb_be(int myInteger){
        return ByteBuffer.allocate(4).order(ByteOrder.BIG_ENDIAN).putInt(myInteger).array();
    }


    private  void throwBrokenSocket(){
        if (mConnectState == 2){
            mConnectState = 0;
        }
    }

    public byte [] decryptBytes(byte [] input) {
        byte [] decryptedBytes = AES.decrypt(input, secretKey);
        return decryptedBytes;
    }

    public void destroy(){
        shouldDie = true;
        dataSubscriber.dispose();
        killSocket();
    }

    private void handleDataStream(JSONObject data){
        try {
            String dataType = data.getString(MessageTypes.MESSAGE_TYPE_LOCAL);
            if (dataType.equals(MessageTypes.AUDIO_CHUNK_ENCRYPTED)) {
                handleEncryptedData(data);
            } else if (dataType.equals(MessageTypes.AUDIO_CHUNK_DECRYPTED)){
                String encodedPlainData = data.getString(MessageTypes.AUDIO_DATA);
                byte [] decodedPlainData = Base64.decode(encodedPlainData, Base64.DEFAULT);
                EventBus.getDefault().post(new AudioChunkNewEvent(decodedPlainData));
            }
        } catch (JSONException e){
            e.printStackTrace();
        }
    }

    //here we decode, decrypt, the encode again. It's not pretty, but it allows us to use a JSON event bus, which makes things way more manageable and modular
    private void handleEncryptedData(JSONObject data){
        try{
            String encodedData = data.getString(MessageTypes.AUDIO_DATA);
            byte [] decodedData = Base64.decode(encodedData, Base64.DEFAULT);
            byte [] plainData = decryptBytes(decodedData);
            String encodedPlainData = Base64.encodeToString(plainData, Base64.DEFAULT);

            //make new object and send as decrypted data
//            JSONObject decryptedData = new JSONObject();
//            decryptedData.put(MessageTypes.MESSAGE_TYPE_LOCAL, MessageTypes.AUDIO_CHUNK_DECRYPTED);
//            decryptedData.put(MessageTypes.AUDIO_DATA, encodedPlainData);
//            dataObservable.onNext(decryptedData);

            //throw new audio event
            EventBus.getDefault().post(new AudioChunkNewEvent(plainData));
        } catch (JSONException e){
            e.printStackTrace();
        }
    }
}
