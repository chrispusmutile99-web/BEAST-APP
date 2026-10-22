// --- NAVIGATION LOGIC ---
function navigate(screenId) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
}

// --- SIMULATE ID VERIFICATION (IPRS) ---
function verifyIdentity() {
    const idInput = document.getElementById('reg-id').value;
    if (idInput.length >= 7) {
        const nameGroup = document.getElementById('name-group');
        const nameInput = document.getElementById('reg-name');
        
        nameGroup.style.display = 'block';
        nameInput.value = "Loading from IPRS...";
        
        // Simulate API delay
        setTimeout(() => {
            nameInput.value = "JOHN DOE KAMAU"; // Fake fetched name
            nameInput.removeAttribute('readonly'); // Allow editing if typo
        }, 1500);
    }
}

// --- COMPLETE REGISTRATION & GENERATE BEAST ID ---
function completeRegistration() {
    const terms = document.getElementById('terms').checked;
    if (!terms) {
        alert("Please accept the Terms & Conditions.");
        return;
    }
    
    // Generate BEAST ID (Simulated - Backend will do this securely later)
    const randomId = Math.floor(Math.random() * 900000) + 100000;
    const beastId = `BEAST-${randomId}`;
    const name = document.getElementById('reg-name').value || "BEAST Member";
    
    // Save to local storage
    localStorage.setItem('beast_id', beastId);
    localStorage.setItem('beast_name', name);
    
    // Update UI
    document.getElementById('display-name').innerText = name.split(' ')[0];
    document.getElementById('display-beast-id').innerText = beastId;
    document.getElementById('card-holder-name').innerText = name.toUpperCase();
    
    alert(`Success! Your BEAST ID is ${beastId}. Keep it safe.`);
    navigate('screen-home');
}

// --- SEND MONEY LOGIC ---
function verifyRecipient() {
    const recInput = document.querySelector('#screen-send .reg-input[type="text"]').value;
    if(recInput.length > 3) {
        document.getElementById('recipient-verified').style.display = 'block';
        document.getElementById('rec-name').innerText = "JANE DOE WANJIKU";
    }
}

function calculateFee(amount) {
    const feeDisplay = document.getElementById('fee-display');
    if (amount > 0) {
        feeDisplay.style.display = 'block';
        // 40% BEAST / 60% Provider logic
        const providerFee = Math.min(amount * 0.01, 100); // Example: 1% capped at 100
        const beastFee = providerFee * 0.4; 
        feeDisplay.innerHTML = `Provider Fee: KES ${providerFee.toFixed(2)}<br>BEAST Fee: KES ${beastFee.toFixed(2)}`;
    } else {
        feeDisplay.style.display = 'none';
    }
}

// --- SECURITY: Face Scan & Transfer ---
function initiateSecureTransfer() {
    // 1. Activate Screenshot/Recording Protection
    document.getElementById('app').classList.add('security-blur');
    
    // 2. Go to Face Scan
    navigate('screen-face-scan');
    
    // 3. Try to access the camera (Real WebRTC)
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(function (stream) {
                console.log("Camera active - Face scanning...");
            })
            .catch(function (err) {
                console.log("Camera denied or unavailable.");
            });
    }
    
    // Simulate the scan taking 4 seconds
    setTimeout(() => {
        document.getElementById('app').classList.remove('security-blur');
        alert("Face Verified. Transaction Approved.");
        navigate('screen-home');
    }, 4000);
}

function cancelTransfer() {
    document.getElementById('app').classList.remove('security-blur');
    navigate('screen-send');
}

// --- ANTI-SCREENSHOT / RECORDING ---
document.addEventListener('visibilitychange', () => {
    const app = document.getElementById('app');
    if (document.hidden) {
        app.classList.add('security-blur');
    } else {
        app.classList.remove('security-blur');
    }
});

// Disable right-click and text selection
document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('selectstart', event => event.preventDefault());

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const savedBeastId = localStorage.getItem('beast_id');
    const savedName = localStorage.getItem('beast_name');
    
    if (savedBeastId && savedName) {
        document.getElementById('display-name').innerText = savedName.split(' ')[0];
        document.getElementById('display-beast-id').innerText = savedBeastId;
        document.getElementById('card-holder-name').innerText = savedName.toUpperCase();
    }
});
