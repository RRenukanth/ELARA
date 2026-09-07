const express = require("express");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);


app.use((req,res,next)=>{
    console.log(req.method, req.url);
    next();
});


app.use(express.json());

app.use(express.static("public"));

app.get("/", (req,res)=>{
    res.sendFile(__dirname+"/views/index.html");
});

let lastSeen = 0;

if(!fs.existsSync("messages.csv"))
{
    fs.writeFileSync(
      "messages.csv",
      "Time,Message\n"
    );
}

app.post("/message",(req,res)=>{

    const msg = req.body.message;

    const time =
      new Date().toLocaleString();

    lastSeen = Date.now();

    fs.appendFileSync(
      "messages.csv",
      `"${time}","${msg}"\n`
    );

    io.emit("newMessage",{
        time,
        msg
    });

    res.sendStatus(200);
});

app.get("/history",(req,res)=>{

    const data =
      fs.readFileSync(
      "messages.csv",
      "utf8"
      );

    res.send(data);
});

setInterval(()=>{

    let connected =
      Date.now()-lastSeen < 10000;

    io.emit(
      "status",
      connected
    );

},1000);

server.listen(3000, '0.0.0.0', () => {
    console.log("Server Running");
});