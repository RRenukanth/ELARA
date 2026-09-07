async function updateStatus() {

    const response = await fetch('/status');
    const data = await response.json();

    const wifi = document.getElementById("wifiStatus");

    if(data.connected){
        wifi.innerHTML = "🟢 Connected";
    }
    else{
        wifi.innerHTML = "🔴 Disconnected";
    }
}

setInterval(updateStatus,1000);

updateStatus();

function toggleSettings(){

    document
    .getElementById("settingsPanel")
    .classList
    .toggle("active");
}

async function submitData(){

    const patientName =
    document.getElementById("patientName").value;

    const heartRate =
    document.getElementById("heartRate").value;

    await fetch("/saveData",{

        method:"POST",

        headers:{
            "Content-Type":"application/json"
        },

        body:JSON.stringify({
            patientName,
            heartRate
        })
    });

    alert("Data Saved");
}