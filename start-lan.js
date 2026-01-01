#!/usr/bin/env node

/**
 * Smart LAN Mode Launcher
 * Automatically detects your WiFi IP and starts Expo with proper hostname
 */

const { exec } = require('child_process');
const { networkInterfaces } = require('os');

function getLocalIPAddress() {
  const nets = networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal (localhost) and non-IPv4 addresses
      const isIPv4 = net.family === 'IPv4';
      const isNotInternal = !net.internal;
      const isWiFi = name.toLowerCase().includes('wi-fi') || 
                     name.toLowerCase().includes('wireless') ||
                     name.toLowerCase().includes('wlan');
      
      if (isIPv4 && isNotInternal) {
        results.push({
          name,
          address: net.address,
          isWiFi,
          priority: isWiFi ? 1 : 2 // WiFi has higher priority
        });
      }
    }
  }

  // Sort by priority (WiFi first)
  results.sort((a, b) => a.priority - b.priority);

  return results;
}

function startExpoLAN() {
  const addresses = getLocalIPAddress();

  if (addresses.length === 0) {
    console.error('❌ Could not detect any network interface');
    console.log('💡 Make sure you are connected to WiFi');
    process.exit(1);
  }

  // Use the first address (WiFi preferred)
  const selectedIP = addresses[0];
  
  console.log('🌐 Detected Network Interfaces:');
  addresses.forEach((addr, idx) => {
    const marker = idx === 0 ? '✅' : '  ';
    console.log(`${marker} ${addr.name}: ${addr.address} ${addr.isWiFi ? '(WiFi)' : ''}`);
  });

  console.log(`\n🚀 Starting Expo with hostname: ${selectedIP.address}\n`);

  // Set environment variable and start Expo
  const command = process.platform === 'win32'
    ? `set REACT_NATIVE_PACKAGER_HOSTNAME=${selectedIP.address} && npx expo start --lan`
    : `REACT_NATIVE_PACKAGER_HOSTNAME=${selectedIP.address} npx expo start --lan`;

  const child = exec(command, { 
    shell: true,
    env: { 
      ...process.env, 
      REACT_NATIVE_PACKAGER_HOSTNAME: selectedIP.address 
    }
  });

  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  child.on('exit', (code) => {
    process.exit(code);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    child.kill('SIGINT');
    process.exit(0);
  });
}

console.log('🎯 Voice Medicine Reminder - Smart LAN Launcher\n');
startExpoLAN();
