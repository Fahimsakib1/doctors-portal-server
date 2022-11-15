
const { MongoClient, ServerApiVersion } = require('mongodb');

const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;

//set up the middle wares
app.use(cors())
app.use(express.json())

require('dotenv').config();

//username: docPortal
//password: hHYphXrdnH6bhlol


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.axoxgat.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri);

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



//API naming convention for CRUD operation

/**
 * app.get('/bookings') => get all the booking data
 * app.get('/bookings/:id') => get a specific booking data
 * app.post('/bookings') => post data to booking collection
 * app.patch('/booking/:id') => update a specific data on booking collection based on id
 * app.put('/booking/:id') => => update a specific data on booking collection based on id
 * app.delete('/booking/:id') => => delete a specific data on booking collection based on id
 */


async function run () {
    try{
        
        const appointOptionCollection = client.db('doctorsPortal').collection('AppointmentOptions');

        const bookingsCollection = client.db('doctorsPortal').collection('bookings')

        
        //get all the appointment options from database. And Use Aggregate to query multiple collection and then merge data
        app.get('/appointmentOptions', async(req, res) => {
            const date = req.query.date;
            //console.log(date);
            const query = {};
            const options = await appointOptionCollection.find(query).toArray();
            
            const bookingQuery = {appointmentDate : date }
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

            options.forEach(option => {
                
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)
                
                const bookedSlots = optionBooked.map(book => book.slot)

                //console.log(optionBooked);
                console.log(date, option.name, bookedSlots);

            })

            res.send(options)
        })



        //post the booking data by modal from client side
        app.post('/bookings', async(req, res) => {
            const booking = req.body
            //console.log(booking);
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        })


    }
    finally{

    }
} 
run().catch(error => console.log(error));






app.get('/', (req, res) => {
    res.send('Doctors Portal server is running')
})

app.listen(port, (req, res) => {
    console.log('Doctors portal server is running on Port', port)
})