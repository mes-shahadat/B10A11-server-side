const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express')
var cookieParser = require('cookie-parser')
var cors = require('cors')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000;

app.use(cors())
app.use(cookieParser())
app.use(express.json())

const uri = process.env.DB_URI;
const jwtSecret = process.env.JWT_SECRET

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
        const allUser = database.collection("all users");
        const allCar = database.collection("all cars");

        // GET
        app.get('/', (req, res) => {

            res.send('car rental server is running...')
        })

        // POST
        app.post('/user', async (req, res) => {

            const doc = req.body

            const result = await allUser.insertOne(doc);

            res.json(result)
        })

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