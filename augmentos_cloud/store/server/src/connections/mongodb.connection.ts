import dotenv from "dotenv";
import mongoose from 'mongoose';
// import { MONGO_URL } from '@augmentos/config';

export const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) throw "MONGO_URL is undefined";

dotenv.config();
// const MONGO_URL: string | undefined = process.env.MONGO_URL;
// Connect to mongo db.
export async function init(): Promise<void> {
  if (!MONGO_URL) throw "MONGO_URL is undefined";
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(MONGO_URL);
    console.log('Mongoose Connected');
  }
  catch(error) {
    console.error(`Unable to connect to database(${MONGO_URL}) ${error}`);
    throw error;
  }
}

// mongoose.connect(mongoURL, {
//   keepAlive: true,
//   useCreateIndex: true,
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// })