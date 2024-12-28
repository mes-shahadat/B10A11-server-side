const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express')
var cors = require('cors')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json())

const uri = process.env.DB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {

    try {

        const database = client.db("car_rental");
        const allCar = database.collection("all cars");

        // GET
        app.get('/', (req, res) => {

            res.send('car rental server is running...')
        })

        // POST
        app.post("/car", async (req, res) => {

            const doc = req.body
            const date = new Date()
            doc.createdAt = date.toISOString()
            doc.updatedAt = date.toISOString()

            const result = await allCar.insertOne(doc);

            res.json(result)

        })

    } finally {

        console.log("finally")
    }
}
run().catch(console.dir);



app.listen(port, () => {
    console.log(`app listening on port ${port}`)
})