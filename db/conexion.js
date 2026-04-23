import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

export async function conectarDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB conectado con Mongoose");
  } catch (error) {
    console.error("Error conectando a MongoDB:", error);
    process.exit(1);
  }
}