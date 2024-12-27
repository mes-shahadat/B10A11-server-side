const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express')
var cors = require('cors')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 5000;

app.use(cors())

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

        app.get('/', (req, res) => {
            res.send('car rental server is running...')
        })

    } finally {

        console.log("finally")
    }
}
run().catch(console.dir);



app.listen(port, () => {
    console.log(`app listening on port ${port}`)
})