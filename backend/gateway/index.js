import express from "express"
import dotenv from "dotenv"
import proxy from "express-http-proxy"
dotenv.config()
import cors from "cors"
import cookieParser from "cookie-parser"
import { getCurrentUser } from "./controllers/user.controller.js"
import protect from "./middleware/auth.middleware.js"
import { proxyWithHeader } from "./utils/proxyWithHeader.js"
import morgan from "morgan"
import { publicAuthOnly, removeClientIdentity } from './utils/authProxy.js'
const port =process.env.PORT

const app=express()
app.use(cors({
    origin:process.env.FRONTEND_URL,
    credentials:true
}))
app.use(morgan("dev"))
app.use(cookieParser())
app.use("/api/auth",publicAuthOnly,proxy(process.env.AUTH_SERVICE, {
    proxyReqOptDecorator: options => { removeClientIdentity(options.headers); return options },
    proxyErrorHandler: (_error, res) => res.status(503).json({ message: 'Authentication service unavailable.' })
}))
app.use("/api/chat",protect,proxyWithHeader(process.env.CHAT_SERVICE))
app.use("/api/agent",protect,proxyWithHeader(process.env.AGENT_SERVICE))
app.use("/api/billing",protect,proxyWithHeader(process.env.BILLING_SERVICE))
app.get("/api/me",protect,getCurrentUser)
app.get("/",(req,res)=>{
    res.json({message:"hello from gateway v4"})
})

app.listen(port,()=>{
    console.log(`gateway started at ${port}`)
})
