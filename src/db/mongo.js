import { MongoClient } from "mongodb";

let client = null;
let db = null;

export async function getDb() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME;

  if (!uri) throw new Error("MONGODB_URI missing in env");
  if (!dbName) throw new Error("DB_NAME missing in env");

  if (db) return db;

  client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 30_000,
  });

  await client.connect();
  db = client.db(dbName);

  // Minimal useful indexes
  await db.collection("harajScrape").createIndex({ firstSeenAt: 1 });
  await db.collection("harajScrape").createIndex({ commentsLastFetchedAt: 1 });

  return db;
}

export async function closeDb() {
  try {
    await client?.close();
  } finally {
    client = null;
    db = null;
  }
}
