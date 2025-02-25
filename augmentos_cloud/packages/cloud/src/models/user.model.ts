// models/user.model.ts
import mongoose, { Schema, Document, Model } from 'mongoose';
import { AppSettingType, type AppSetting } from '@augmentos/types';

// Extend Document for TypeScript support
interface UserDocument extends Document {
  email: string;
  runningApps: string[];
  appSettings: Map<string, AppSetting[]>;

  addRunningApp(appName: string): Promise<void>;
  removeRunningApp(appName: string): Promise<void>;
  updateAppSettings(appName: string, settings: { key: string; value: any }[]): Promise<void>;
  getAppSettings(appName: string): AppSetting[] | undefined;
  isAppRunning(appName: string): boolean;
}

// --- New Schema for Lightweight Updates ---
const AppSettingUpdateSchema = new Schema({
  key: { type: String, required: true },
  value: { type: Schema.Types.Mixed, required: true }
}, { _id: false });

// // Setting schemas (unchanged)
// const ToggleSettingSchema = new Schema({
//   type: { type: String, enum: ['toggle'], required: true },
//   key: { type: String, required: true },
//   label: { type: String, required: true },
//   defaultValue: { type: Boolean, required: true }
// });

// const TextSettingSchema = new Schema({
//   type: { type: String, enum: ['text'], required: true },
//   key: { type: String, required: true },
//   label: { type: String, required: true },
//   defaultValue: { type: String }
// });

// const SelectOptionSchema = new Schema({
//   label: { type: String, required: true },
//   value: { type: String, required: true }
// });

// const SelectSettingSchema = new Schema({
//   type: { type: String, enum: ['select'], required: true },
//   key: { type: String, required: true },
//   label: { type: String, required: true },
// });

// --- User Schema ---
const UserSchema = new Schema<UserDocument>({
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: (email: string) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Invalid email format'
    }
  },
  runningApps: { 
    type: [String], 
    default: [],
    validate: {
      validator: function(apps: string[]) {
        return new Set(apps).size === apps.length;
      },
      message: 'Running apps must be unique'
    }
  },
  appSettings: {
    type: Map,
    of: [AppSettingUpdateSchema], // Use the new schema for updates
    default: new Map()
  }
}, { 
  timestamps: true,
  optimisticConcurrency: true,
  toJSON: {
    transform: (doc, ret) => {
      delete ret.__v;
      ret.id = ret._id;
      delete ret._id;
      ret.appSettings = Object.fromEntries(ret.appSettings);
      return ret;
    }
  }
});

// // Add discriminators
// AppSettingUpdateSchema.discriminator('toggle', ToggleSettingSchema);
// AppSettingUpdateSchema.discriminator('text', TextSettingSchema);
// AppSettingUpdateSchema.discriminator('select', SelectSettingSchema);

// Create compound index for unique running apps per user
UserSchema.index({ email: 1, 'runningApps': 1 }, { unique: true });

// Instance methods
UserSchema.methods.addRunningApp = async function(this: UserDocument, appName: string): Promise<void> {
  if (!this.runningApps.includes(appName)) {
    this.runningApps.push(appName);
    await this.save();
  }
};

UserSchema.methods.removeRunningApp = async function(this: UserDocument, appName: string): Promise<void> {
  if (this.runningApps.includes(appName)) {
    this.runningApps = this.runningApps.filter(app => app !== appName);
    await this.save();
  }
};

UserSchema.methods.updateAppSettings = async function(
  appName: string, 
  settings: { key: string; value: any }[]
): Promise<void> {
  console.log('Settings update payload (before saving):', JSON.stringify(settings));

  // Retrieve existing settings and convert subdocuments to plain objects.
  const existingSettings = this.appSettings.get(appName);
  let existingSettingsPlain: { key: string; value: any }[] = [];
  if (existingSettings && Array.isArray(existingSettings)) {
    existingSettingsPlain = existingSettings.map((s: any) =>
      typeof s.toObject === 'function' ? s.toObject() : s
    );
  }

  // Create a map from the existing settings.
  const existingSettingsMap = new Map(existingSettingsPlain.map(s => [s.key, s.value]));

  // Merge updates from the payload.
  settings.forEach(update => {
    if (update.key !== undefined) { // extra guard to prevent undefined keys
      existingSettingsMap.set(update.key, update.value);
    }
  });

  // Convert the merged map back into an array of settings.
  const updatedSettingsArray = Array.from(existingSettingsMap.entries()).map(
    ([key, value]) => ({ key, value })
  );

  this.appSettings.set(appName, settings);
  await this.save();

  console.log('Updated settings:', JSON.stringify(updatedSettingsArray));
  const afterUpdate = this.appSettings.get(appName);
  console.log('Settings retrieved after save:', JSON.stringify(afterUpdate));
};

UserSchema.methods.getAppSettings = function(this: UserDocument, appName: string): AppSetting[] | undefined {
  return this.appSettings.get(appName);
};

UserSchema.methods.isAppRunning = function(this: UserDocument, appName: string): boolean {
  return this.runningApps.includes(appName);
};

// --- Static Methods ---
UserSchema.statics.findByEmail = async function(email: string): Promise<UserDocument | null> {
  return this.findOne({ email: email.toLowerCase() });
};

UserSchema.statics.findOrCreateUser = async function(email: string): Promise<UserDocument> {
  email = email.toLowerCase();
  let user = await this.findOne({ email });
  if (!user) {
    user = await this.create({ email });
  }
  return user;
};

// --- Middleware ---
UserSchema.pre('save', function(next) {
  if (this.email) {
    this.email = this.email.toLowerCase();
  }
  if (this.runningApps) {
    this.runningApps = [...new Set(this.runningApps)];
  }
  next();
});

// --- Interface for Static Methods ---
interface UserModel extends Model<UserDocument> {
  findByEmail(email: string): Promise<UserDocument | null>;
  findOrCreateUser(email: string): Promise<UserDocument>;
}

export const User = mongoose.model<UserDocument, UserModel>('User', UserSchema);
