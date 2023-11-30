const express = require('express');
require('dotenv').config();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

const port = process.env.PORT || 5000;


const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// middleware
app.use(cors());
app.use(express.json());





// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.46pnwto.mongodb.net/?retryWrites=true&w=majority`;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mkkr0dd.mongodb.net/?retryWrites=true&w=majority`;

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
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("dcmsDB").collection("users");
    const testCollection = client.db("dcmsDB").collection("tests");
    const bookedTestCollection = client.db("dcmsDB").collection("bookedTests");
    const bannerCollection = client.db("dcmsDB").collection("banner");
    const recommendationCollection = client.db("dcmsDB").collection("recommendation");

    //jwt related API
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

    // middlewares 
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }


    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    // recommendation related api
    app.get('/recommendation', async (req, res) => {
      const info = await recommendationCollection.find().toArray();
      res.json(info);
    })

    app.post('/recommendation', async (req, res) => {
      const item = req.body;
      const result = await recommendationCollection.insertOne(item);
      res.send(result);
    });



    //Banner realted API


    app.get('/banner', async (req, res) => {
      const banner = await bannerCollection.find().toArray();
      res.json(banner);
    })

    app.post('/banner', async (req, res) => {
      const item = req.body;
      const result = await bannerCollection.insertOne(item);
      res.send(result);
    });

    app.patch('/banner/updateStatus', async (req, res) => {
      const { banners } = req.body;

      // Validate the request body
      if (!Array.isArray(banners) || banners.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty banners array' });
      }

      try {
        // Update all banners with new statuses
        const updatePromises = banners.map(async (banner) => {
          const id = banner._id;
          const filter = { _id: new ObjectId(id) };
          const status = banner.is_Active;

          if (!status || (status !== 'true' && status !== 'false')) {
            throw new Error(`Invalid status value for banner with ID ${id}`);
          }

          const updatedDoc = {
            $set: {
              is_Active: status
            }
          };

          return await bannerCollection.updateOne(filter, updatedDoc);
        });

        // Wait for all update operations to complete
        const results = await Promise.all(updatePromises);

        res.json({ modifiedCount: results.length });
      } catch (error) {
        console.error('Error updating banner statuses:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });


    //test related API

    app.get('/tests', async (req, res) => {
      const currentDate = new Date().toISOString().split('T')[0];
      const startDate = req.query.startDate || currentDate;

      // Query tests with available dates greater than or equal to the specified start date
      const tests = await testCollection.find({ date: { $gte: startDate } }).toArray();

      res.json(tests);
    })
 
    app.get('/test/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await testCollection.findOne(query);
      res.send(result);
    })

    app.post('/tests', async (req, res) => {
      const item = req.body;
      const result = await testCollection.insertOne(item);
      res.send(result);
    });


    app.patch('/test/:id', async (req, res) => {
      const item = req.body;
      console.log(item);
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          testName: item.testName,
          price: item.price,
          date: item.date,
          slots: item.slots,
          details: item.details,
          image: item.image
        }
      }

      const result = await testCollection.updateOne(filter, updatedDoc)
      res.send(result);
    })

    app.get('/testsCount', async (req, res) => {
      const count = await testCollection.estimatedDocumentCount();
      res.send({ count });
    })


    app.delete('/test/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await testCollection.deleteOne(query);
      res.send(result);
    })

    // users related api
    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });




    app.get('/users/update/:id', async (req, res) => {
      const id = req.params.id;
      console.log('user update', id);
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.findOne(query);
      console.log(result);
      res.send(result);
    })

    app.patch('/users/update/:id', async (req, res) => {
      const userData = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          name: userData.name,
          email: userData.email,
          bloodGroup: userData.bloodGroup,
          district: userData.district,
          upazila: userData.upazila,

          photoURL: userData.photoURL,
        }
      }

      const result = await userCollection.updateOne(filter, updatedDoc)
      res.send(result);
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      // insert email if user doesnt exists: 
      // you can do this many ways (1. email unique, 2. upsert 3. simple checking)
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send(user);

    })

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });

    })

    app.get('/users/status/:email', verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let activeUser = false;
      if (user) {
        activeUser = user?.status === 'active';
      }
      res.send({ activeUser });

    })


    app.patch('/users/role/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const { role } = req.body; // Assuming you pass the new role in the request body

      if (!role || (role !== 'admin' && role !== 'user')) {
        return res.status(400).json({ error: 'Invalid role value' });
      }

      const updatedDoc = {
        $set: {
          role: role
        }
      };

      try {
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.json(result);
      } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });
    app.patch('/users/status/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const { status } = req.body; // Assuming you pass the new status in the request body

      if (!status || (status !== 'active' && status !== 'blocked')) {
        return res.status(400).json({ error: 'Invalid status value' });
      }

      const updatedDoc = {
        $set: {
          status: status
        }
      };

      try {
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.json(result);
      } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })


    // Booked Test Collection 
    app.get('/bookedTests', verifyToken, verifyAdmin, async (req, res) => {
      const result = await bookedTestCollection.find().toArray();
      res.send(result);
    });



    app.get('/bookedTest', verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await bookedTestCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/bookedTests', async (req, res) => {
      const bookedTestData = req.body;

      // Update the test item count using the $inc operator
      const testId = bookedTestData.testId;
      // Convert the jobId to ObjectId
      const bookedTestObjectId = new ObjectId(testId);

      // Update the test item count by decrementing it by 1
      await testCollection.updateOne(
        { _id: bookedTestObjectId },
        { $inc: { slots: -1 } }
      );

      const result = await bookedTestCollection.insertOne(bookedTestData);

      res.send(result);
    });

    app.patch('/bookedTests/:id', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { report, pdfLink } = req.body;

      try {
        const objectId = new ObjectId(id);

        const filter = { _id: objectId };
        const update = {
          $set: {
            report,
            pdfLink,
          },
        };

        const options = { returnDocument: 'after' };

        const result = await bookedTestCollection.findOneAndUpdate(
          filter,
          update,
          options
        );

        res.json(result.value); // Send the updated document
      } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
      }
    });



    app.delete('/bookedTest/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await bookedTestCollection.deleteOne(query);
      res.send(result);
    });



    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount, 'amount inside the intent')

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    });


    // most booked API

    app.get('/featured-tests', async (req, res) => {
      try {
        const mostBookedTests = await bookedTestCollection.aggregate([
          {
            $group: {
              _id: { $toObjectId: '$testId' }, // Convert testId to ObjectId
              count: { $sum: 1 },
            },
          },
          {
            $lookup: {
              from: 'tests',
              localField: '_id',
              foreignField: '_id',
              as: 'testDetails',
            },
          },
          {
            $sort: { count: -1 },
          },
          {
            $limit: 5,
          },
          {
            $unwind: '$testDetails',
          },
          {
            $project: {
              _id: '$testDetails._id',
              testName: '$testDetails.testName',
              image: '$testDetails.image',
              slots: '$testDetails.slots',
              date: '$testDetails.date',
              count: 1,
            },
          },
        ]).toArray();

        res.json(mostBookedTests);
      } catch (error) {
        console.error('Error fetching most booked tests:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });



    app.post('/upload', upload.single('file'), (req, res) => {
      try {
        const file = req.file;
        console.log(file);

        if (!file) {
          throw new Error('No file or file buffer found');
        }

        // Decode the original file name
        const originalFileName = decodeURIComponent(file.originalname);

        // Process the file as needed
        // ...

        // Instead of a placeholder, you can send the actual link or data
        const actualLinkOrData = 'your_actual_link_or_data';
        res.json({ link: actualLinkOrData });

      } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });






    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('dcms is sitting')
})

app.listen(port, () => {
  console.log(`dcms is sitting on port ${port}`);
})

