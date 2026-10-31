import mongoose from "mongoose";

const userSchema=new mongoose.Schema({
    firebaseUid:{
        type:String,
        unique:true
    },
    name:String,
    email:String,
    avatar:String,
    plan:{
        type:String,
        default:"free"
    },
    credits:{
        type:Number,
        default:100
    },
    totalCredits:{
        type:Number,
        default:100
    },
    planExpiresAt:Date,
    creditGrants: [{ _id: false, id: String, plan: String, credits: Number, createdAt: Date }],
    creditReservations: [{ _id: false, id: String, agent: String, reserved: Number, charged: Number,
        state: { type: String, enum: ['reserved', 'settled'] }, createdAt: Date }]

},{
    timestamps:true
})

const User=mongoose.model("User",userSchema)
export default User
