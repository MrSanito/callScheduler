// readDB.js
import "dotenv/config";
import mongoose from "mongoose";

async function queryDB() {
  const uri = process.env.MONGODB_URI;
  console.log("Connecting to MongoDB URI:", uri);
  
  try {
    await mongoose.connect(uri);
    console.log("Successfully connected! Current connected database name:", mongoose.connection.name);

    const db = mongoose.connection.db;

    // List all collections in the current database
    const collections = await db.listCollections().toArray();
    console.log("\n=================== COLLECTIONS IN DATABASE ===================");
    if (collections.length === 0) {
      console.log("No collections found in this database!");
    } else {
      for (const col of collections) {
        const count = await db.collection(col.name).countDocuments({});
        console.log(`- Collection Name: "${col.name}" | Total Documents: ${count}`);
        
        // Print up to 3 documents to inspect the content
        if (count > 0) {
          const docs = await db.collection(col.name).find({}).limit(3).toArray();
          console.log(`  Sample Documents:`, JSON.stringify(docs, null, 2));
        }
      }
    }
    console.log("=================================================================\n");

  } catch (err) {
    console.error("Database query failed:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("\nDisconnected from database.");
  }
}

queryDB();
