
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;

//set up the middle wares
app.use(cors())
app.use(express.json())

require('dotenv').config();

//require jwt
const jwt = require('jsonwebtoken')

//username: docPortal
//password: hHYphXrdnH6bhlol

//require stripe secret key
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.axoxgat.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri);

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



//API naming convention for CRUD operation

/**
 * app.get('/bookings') => get all the booking data
 * app.get('/bookings/:id') => get a specific booking data
 * app.post('/bookings') => post data to booking collection.. Post er shomoy toArray() korte hoy na
 * app.patch('/booking/:id') => update a specific data on booking collection based on id
 * app.put('/booking/:id') => => update a specific data on booking collection based on id
 * app.delete('/booking/:id') => => delete a specific data on booking collection based on id
 */


//function for verify jwt token
function verifyJWT(req, res, next) {

    const accessToken = req.headers.authorization;
    console.log(" Token inside verifyJWT function: ", accessToken)

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send('Unauthorized Access')
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {
        if (error) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded;
        next();
    })

}






async function run() {
    
    try {

        const appointOptionCollection = client.db('doctorsPortal').collection('AppointmentOptions');

        const bookingsCollection = client.db('doctorsPortal').collection('bookings');

        const usersCollection = client.db('doctorsPortal').collection('users');

        const doctorsCollection = client.db('doctorsPortal').collection('doctors');

        const paymentsCollection = client.db('doctorsPortal').collection('payments');


        //middleware for admin verification.. verifyAdmin should use after verifyJWT function
        const verifyAdmin = async (req, res, next) => {
            console.log("Inside verifyAdmin Middleware", req.decoded.email);
            
            const decodedEmail = req.decoded.email;

            const user = { email: decodedEmail }

            const findUser = await usersCollection.findOne(user);

            if (findUser.role !== 'Admin') {
                return res.status(403).send({ message: 'Forbidden  Access' })
            }

            next();
        }



        //get all the appointment options from database. And Use Aggregate to query multiple collection and then merge data
        app.get('/appointmentOptions', async (req, res) => {
            const date = req.query.date;
            //console.log(date);
            const query = {};
            const options = await appointOptionCollection.find(query).toArray();

            //get the booking for provided date
            const bookingQuery = { appointmentDate: date }
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

            //appointment options
            options.forEach(option => {

                //get the booked treatment option
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)

                //get the slots booked treatment option
                const bookedSlots = optionBooked.map(book => book.slot)

                //get the remaining slots for that booked treatment option
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))

                //remaining slot gulai treatment option er slot hobe. jate kore client side e per booking er jonno koyta slot baki ache sheita dekhaite pari
                option.slots = remainingSlots;

                //console.log(optionBooked);
                console.log(date, option.name, bookedSlots, remainingSlots.length);

            })

            res.send(options)
        })


        //Use mongodb aggregate project pipeline (High Level)
        app.get('/v2/appointmentOptions', async (req, res) => {
            const date = req.query.date;
            const options = await appointOptionCollection.aggregate([
                {
                    $lookup: {
                        from: 'bookings',
                        localField: 'name',
                        foreignField: 'treatment',
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ['$appointmentDate', date]
                                    }
                                }
                            }
                        ],
                        as: 'booked'
                    }
                },

                {
                    $project: {
                        name: 1,
                        slots: 1,
                        booked: {
                            $map: {
                                input: '$booked',
                                as: 'book',
                                in: '$$book.slot'
                            }
                        }
                    }
                },

                {
                    $project: {
                        name: 1,
                        slots: {
                            $setDifference: ['$slots', '$booked']
                        }
                    }
                }
            ]).toArray();
            res.send(options)
        })





        //post the booking data by modal from client side
        app.post('/bookings', async (req, res) => {
            const booking = req.body
            //console.log(booking);
            const query = {
                appointmentDate: booking.appointmentDate,
                treatment: booking.treatment,
                email: booking.email
            }

            const bookedOnThatDay = await bookingsCollection.find(query).toArray();

            if (bookedOnThatDay.length) {
                const message = `You Already Have a Booking on ${booking.appointmentDate} for ${booking.treatment}`;
                return res.send({ acknowledged: false, message });
            }

            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        })


        //get the booking data (appointments) for specific user email and verify JWT Token
        app.get('/bookings', verifyJWT, async (req, res) => {

            const email = req.query.email;
            console.log(email);

            const decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'Forbidden  Access' })
            }

            let query = {}

            if (email) {
                query = { email }
            }
            //const query = {email: email}
            const result = await bookingsCollection.find(query).toArray()
            res.send(result);
        });



        //post the registered users information to the database when the user signs up. If the user is already in database then he will not inserted to database again.. Google sign up korar shomoy jate bar bar user info database er moddhe na jay tar jonno agey theke database er moddhe check kora holo j oi user email ta database er moddhe ache ki na
        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log("Google Sign In User",user);

            const query = {
                email: user.email 
            }

            const findAlreadyUserInDataBase = await usersCollection.find(query).toArray();
            console.log("User already in database", findAlreadyUserInDataBase.length);

            if (findAlreadyUserInDataBase.length) {
                const message = 'This User Email Already Exists';
                return res.send({ acknowledged: false, message });
            }

            //post request er shomoy toArray() korte hoy na
            const result = await usersCollection.insertOne(user);
            res.send(result)
        })

        
        
        //get all the user from database and show it on the dashboard on client side
        // app.get('/users', async (req, res) => {
        //     const query = {};
        //     const users = await usersCollection.find(query).toArray();
        //     res.send(users);
        // })


        //get all the user from database and verify them and show it on the dashboard on client side
        app.get('/users', verifyJWT, async(req, res) =>{

            const decodedEmail = req.decoded.email;
            const user = {email: decodedEmail}
            const findUser = await usersCollection.findOne(user);
            
            if(findUser.role !== 'Admin'){
                return res.status(403).send({message: 'Forbidden  Access', accessToken: {}})
            }

            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        })







        //get a specific user  based on user id to check he is admin or not.. user admin na hole client side e dashboard er moddhe registered users ei option tai dekhabe na
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'Admin' });
        })


        //user k update kora and ta re admin roll dewa client side theke.. Jodi user nije Admin na hoy tahole se onno kauke admin banaite parbe na
        app.put('/users/admin/:id', verifyJWT, async (req, res) => {

            const decodedEmail = req.decoded.email;

            const user = { email: decodedEmail }

            const findUser = await usersCollection.findOne(user);

            if (findUser.role !== 'Admin') {
                return res.status(403).send({ message: 'Forbidden  Access' })
            }

            const id = req.params.id;
            const query = { _id: ObjectId(id) }

            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    role: 'Admin'
                }
            }

            const result = await usersCollection.updateOne(query, updatedDoc, options);
            res.send(result);
        })




        //generate jwt token when the user is created (sign in) in the client side
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }

            const user = await usersCollection.findOne(query)
            //console.log(user);

            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '20d' })

                return res.send({ accessToken: token })
            }
            else {
                return res.status(403).send({ accessToken: 'User not Found' })
            }

        })


        //code for jwt token when the user login to the system
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            console.log("User From Sever side: ", user);
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '20d' });
            res.send({ token })
        })



        //Doctor Related API's Starts From Here


        //get only the treatment name form appointOptionCollection API for adding a doctor's specialty on Add a Doctor at the client side
        app.get('/appointmentSpecialty', async(req, res) => {
            const query = {}
            const result = await appointOptionCollection.find(query).project({name : 1}).toArray();
            res.send(result);
        })
        

        //post the doctors information (Add a doctor) to database from client side
        app.post('/doctors',verifyJWT, verifyAdmin, async(req, res) => {
            const doctor = req.body;
            console.log(doctor);

            const query = {
                email: doctor.email
            }

            const findAlreadyDoctorInDataBase = await doctorsCollection.find(query).toArray();
            console.log("Doctor already in database", findAlreadyDoctorInDataBase.length);

            if (findAlreadyDoctorInDataBase.length) {
                const message = 'Doctor Has Already Added';
                return res.send({ acknowledged: false, message });
            }

            const result = await doctorsCollection.insertOne(doctor);
            res.send(result)
        })




        //get all the doctor's information from database and show it on the manage doctor's page in client side
        app.get('/doctors', verifyJWT, verifyAdmin , async(req, res) => {
            const query = {};
            const doctors = await doctorsCollection.find(query).toArray();
            res.send(doctors);
        })


        //delete a doctor based on id
        app.delete('/doctors/:id',verifyJWT , verifyAdmin, async(req, res) => {
            const id = req.params.id;
            console.log('Deleting The ID', id);
            const query = {_id : ObjectId(id)}
            const result = await doctorsCollection.deleteOne(query);
            res.send(result)
        })







        //Payment related code starts from here


         //AppointmentOptions collection er moddhe price field add kora
        // app.get('/addPrice', async (req, res) => {
        //     const filter = {};
        //     const options = {upsert: true}
        //     const updatedDoc = {
        //         $set: {
        //             price: 145
        //         }
        //     }
        //     const result = await appointOptionCollection.updateMany(filter, updatedDoc, options);
        //     res.send(result)
        // })

        
        //get a specific booking data from id
        app.get('/bookings/:id', async(req, res) => {
            const id = req.params.id;
            const filter = {_id : ObjectId(id)}
            const result = await bookingsCollection.findOne(filter);
            res.send(result);
        })


        //post the client er information from client side for payment
        app.post('/create-payment-intent', async(req, res) => {
            const booking = req.body;
            const price = booking.price;
            //console.log("Booking Price", price);
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                "payment_method_types": [
                    "card"
                ],

            })
            res.send({
                clientSecret: paymentIntent.client_secret,
            });

        })

        //post the payment info for a treatment from client side
        app.post('/payments', async(req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);

            const id = payment.bookingId;
            const filter = {_id :ObjectId(id)};
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updateBookingData = await bookingsCollection.updateOne(filter, updatedDoc)
            res.send(result)
        })







    }
    finally {

    }
}
run().catch(error => console.log(error));






app.get('/', (req, res) => {
    res.send('Doctors Portal server is running')
})

app.listen(port, (req, res) => {
    console.log('Doctors portal server is running on Port', port)
})