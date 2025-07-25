// ✅ Final Fixed Full Backend Code
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const cors = require("cors");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const app = express();
const allowedOrigins = [
  "http://localhost:5173",              // local dev
  "https://class-codehub.vercel.app"    // production frontend
];  
// Middleware
app.use(express.json());
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(
  session({
    secret: "my_super_secret_123456789!@#",
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: "lax", secure: false },
  })
);

// MongoDB connection
mongoose
  .connect("mongodb+srv://dbone:dbone@cluster0.1vljvnr.mongodb.net/codeview", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"));

// Schemas
const StudentSchema = new mongoose.Schema({
  name: String,
  email: { type: String }, // NO "unique: true"
  password: { type: String, default: null },
  branchname: String,
  batchname: String,
});

const BranchSchema = new mongoose.Schema({
  branchname: { type: String, required: true, lowercase: true },
  batchname: { type: String, required: true },
});

const LessonSchema = new mongoose.Schema({
  branchname: String,
  batchname: String,
  studentsname: [String],
  createddate: String,
  topicname: String,
  filenames: [String],
  classtype: String,
});

const Student = mongoose.model("Student", StudentSchema);
const Branch = mongoose.model("Branch", BranchSchema);
const Lesson = mongoose.model("Lesson", LessonSchema);

// Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });
app.post("/upload-lesson", upload.array("filenames"), async (req, res) => {
  try {
    const {
      branchname,
      batchname,
      createddate,
      topicname,
      studentsname,
      classtype,
    } = req.body;

    // Step 1: Normalize student names (to lowercase, trimmed)
    let studentsArray = [];
    if (studentsname) {
      if (Array.isArray(studentsname)) {
        studentsArray = studentsname;
      } else {
        studentsArray = [studentsname];
      }
    }

    // Step 2: Remove duplicates (case-insensitive)
    const uniqueStudents = Array.from(new Set(
      studentsArray.map(name => name.trim().toLowerCase())
    ));

    // Step 3: Create missing student entries (only for new students)
    for (const name of uniqueStudents) {
      const exists = await Student.findOne({
        name: name,
        branchname: branchname.toLowerCase().trim(),
        batchname: batchname.trim(),
      });

      if (!exists) {
        await Student.create({
          name: name,
          email: `${name}-${Date.now()}@example.com`,
          branchname: branchname.toLowerCase().trim(),
          batchname: batchname.trim(),
        });
      }
    }

    // Step 4: Get uploaded file names
    const filenames = req.files.map(file => file.filename);

    // Step 5: Save new lesson with unique student names
    const newLesson = new Lesson({
      branchname,
      batchname,
      studentsname: uniqueStudents,  // ✅ no duplicates here
      createddate,
      topicname,
      filenames,
      classtype,
    });

    await newLesson.save();

    res.status(200).json({ message: "Lesson uploaded and students created" });

  } catch (error) {
    console.error("Upload lesson error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// app.post("/upload-lesson", upload.array("filenames"), async (req, res) => {
//   try {
//     const {
//       branchname,
//       batchname,
//       createddate,
//       topicname,
//       studentsname,
//       classtype,
//     } = req.body;

//     // Normalize student names
//     let studentsArray = [];
//     if (studentsname) {
//       if (Array.isArray(studentsname)) {
//         studentsArray = studentsname;
//       } else {
//         studentsArray = [studentsname];
//       }
//     }

//     studentsArray = studentsArray.map(name => name.trim().toLowerCase());

//     // Check and insert missing students (avoid duplicate email)
//     for (const name of studentsArray) {
//       const exists = await Student.findOne({
//         name: name,
//         branchname: branchname.toLowerCase().trim(),
//         batchname: batchname.trim(),
//       });

//       if (!exists) {
//         await Student.create({
//           name: name,
//           email: `${name}-${Date.now()}@example.com`,
//           branchname: branchname.toLowerCase().trim(),
//           batchname: batchname.trim(),
//           // No email field inserted = avoids duplicate issue
//         });
//       }
//     }

//     const filenames = req.files.map(file => file.filename);

//     const newLesson = new Lesson({
//       branchname,
//       batchname,
//       studentsname: studentsArray,
//       createddate,
//       topicname,
//       filenames,
//       classtype,
//     });

//     await newLesson.save();

//     res.status(200).json({ message: "Lesson uploaded and students created" });
//   } catch (error) {
//     console.error("Upload lesson error:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

// Branch Creation
app.post("/create-branch", async (req, res) => {
  const { branchname, batchname } = req.body;
  const newBranch = new Branch({ branchname, batchname });
  await newBranch.save();
  res.json({ success: true });
});

app.get("/get-batches", async (req, res) => {
  const batches = await Branch.find();
  res.json(batches);
});

// Student Query
app.get("/students-by-branch-batch", async (req, res) => {
  const { branchname, batchname } = req.query;

  if (!branchname || !batchname) {
    return res.status(400).json({ message: "Missing branchname or batchname" });
  }

  try {
    const students = await Student.find({
      branchname: { $regex: new RegExp(`^${branchname}$`, "i") },
      batchname: { $regex: new RegExp(`^${batchname}$`, "i") },
    });
    res.json(students);
  } catch (err) {
    console.error("Error in /students-by-branch-batch:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Signup with email
app.post("/signup", async (req, res) => {
  const { name, email, password, branchname, batchname } = req.body;

  const existing = await Student.findOne({ email });
  if (existing) {
    return res.status(400).json({ message: "Email already registered" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const student = new Student({
    name,
    email,
    password: hashedPassword,
    branchname: branchname.toLowerCase(),
    batchname
  });

  await student.save();
  res.json({ message: "Signup successful" });
});

// 🔐 Student Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if student exists
    const student = await Student.findOne({ email });
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Check password (plain or hashed)
    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Login successful
    req.session.user = {
      email: student.email,
      batchname: student.batchname,
      branchname: student.branchname
    };

    res.json({
      email: student.email,
      batchname: student.batchname,
      branchname: student.branchname
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});
// Admin lesson view
app.get("/lessons", async (req, res) => {
  const { branchname, batchname, page = 1, limit = 5 } = req.query;
  const query = {};
  if (branchname) query.branchname = branchname;
  if (batchname) query.batchname = batchname;

  const lessons = await Lesson.find(query)
    .sort({ createddate: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Lesson.countDocuments(query);

  res.json({ lessons, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

// Student lessons
app.get("/stulessons", async (req, res) => {
  const { batchname, branchname, email, page = 1, limit = 5 } = req.query;

  if (!batchname || !branchname || !email) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const student = await Student.findOne({ email });
  if (!student || student.batchname !== batchname || student.branchname !== branchname) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const query = { batchname, branchname };

  const lessons = await Lesson.find(query)
    .sort({ createddate: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Lesson.countDocuments(query);

  res.json({ lessons, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy();
  res.json({ message: "Logged out" });
});

// Server Start
app.listen(10000, () => {
  console.log("Server started on port 10000");
});
