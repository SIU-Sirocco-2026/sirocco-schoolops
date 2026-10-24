import express from "express";
const app=express();
app.get("/api/health/live",(_req,res)=>res.json({status:"ok"}));
app.listen(Number(process.env.PORT || 3000),"0.0.0.0");
