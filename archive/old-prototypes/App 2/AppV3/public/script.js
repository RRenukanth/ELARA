const menuBtn =
document.getElementById("menuBtn");

const sidebar =
document.getElementById("sidebar");

const overlay =
document.getElementById("overlay");

function toggleMenu(){

    menuBtn.classList.toggle("active");

    sidebar.classList.toggle("active");

    overlay.classList.toggle("active");
}

menuBtn.addEventListener(
    "click",
    toggleMenu
);

overlay.addEventListener(
    "click",
    toggleMenu
);

async function updateStatus(){

    try{

        const response =
        await fetch("/status");

        const data =
        await response.json();

        const status =
        document.getElementById("wifiStatus");

        if(data.connected){

            status.innerHTML =
            "🟢 Connected";

        }else{

            status.innerHTML =
            "🔴 Disconnected";
        }

    }catch(error){

        document.getElementById(
            "wifiStatus"
        ).innerHTML =
        "⚠ Server Offline";
    }
}

setInterval(updateStatus,1000);

updateStatus();

async function submitData(){

    const patientName =
    document.getElementById(
        "patientName"
    ).value;

    const heartRate =
    document.getElementById(
        "heartRate"
    ).value;

    const response =
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

    const result =
    await response.json();

    if(result.success){

        alert(
            "Data Saved Successfully"
        );
    }
}