const socket = io();

socket.on("newMessage",(data)=>{

document.getElementById(
"message"
).innerText=data.msg;

document.getElementById(
"time"
).innerText=data.time;

});

socket.on("status",(connected)=>{

let status =
document.getElementById(
"status"
);

status.innerText =
connected
?
"Connected"
:
"Disconnected";

status.style.color =
connected
?
"green"
:
"red";

});

document
.getElementById(
"historyBtn"
)
.onclick=async()=>{

let response =
await fetch(
"/history"
);

let csv =
await response.text();

let rows =
csv.trim().split("\n");

let body =
document.getElementById(
"historyBody"
);

body.innerHTML="";

for(let i=1;i<rows.length;i++)
{
let cols =
rows[i].split(",");

body.innerHTML += `
<tr>
<td>${cols[0]}</td>
<td>${cols[1]}</td>
</tr>
`;
}

document.getElementById(
"historySection"
).style.display="block";

};

document
.getElementById(
"liveBtn"
)
.onclick=()=>{

document
.getElementById(
"historySection"
).style.display="none";

};