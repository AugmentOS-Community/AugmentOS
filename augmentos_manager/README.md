# AugmentOS Setup Guide

## Getting Started

1. Configure Environment
   - Copy `.env.example` to create your `.env` file
   - Configure server settings in `.env` (default: localhost)

2. Install & Start: `npm start`

3. Launch the backend:

From the augmentos_cloud folder: `./run.sh`

4. If you're running the backend on localhost and want to access it from your connected phone:

`adb reverse tcp:8002 tcp:8002`