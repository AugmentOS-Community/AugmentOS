export type GlassesFeature = "camera" | "speakers" | "microphone" | "display" | "binocular" | "wifi" | "imu"

export interface GlassesFeatureSet {
  camera: boolean
  speakers: boolean
  microphone: boolean
  display: boolean
  binocular: boolean
  wifi: boolean
  imu: boolean
}

export const glassesFeatures: Record<string, GlassesFeatureSet> = {
  "Even Realities G1": {
    camera: false,
    speakers: false,
    microphone: true,
    display: true,
    binocular: true,
    wifi: false,
    imu: true,
  },
  "Vuzix Z100": {
    camera: false,
    speakers: false,
    microphone: false,
    display: true,
    binocular: false,
    wifi: false,
    imu: false,
  },
  "Mentra Live": {
    camera: true,
    speakers: true,
    microphone: true,
    display: false,
    binocular: false,
    wifi: true,
    imu: false,
  },
  "Mentra Mach1": {
    camera: false,
    speakers: false,
    microphone: false,
    display: true,
    binocular: false,
    wifi: false,
    imu: false
  },
  "Audio Wearable": {
    camera: false,
    speakers: true,
    microphone: true,
    display: false,
    binocular: false,
    wifi: false,
    imu: false,
  },
  "Simulated Glasses": {
    camera: true,
    speakers: true,
    microphone: true,
    display: true,
    binocular: false,
    wifi: false,
    imu: false,
  },
}

export const featureLabels: Record<GlassesFeature, string> = {
  camera: "Camera",
  speakers: "Speakers",
  microphone: "Microphone",
  display: "Display",
  binocular: "Binocular",
  wifi: "WiFi",
  imu: "IMU"
}
