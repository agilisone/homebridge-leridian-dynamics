<span align="center">

# Homebridge Leridian Dynamics
## Apple Homekit integration for the Smart Recirculation Control 32 System

</span>

This [Homebridge](https://github.com/homebridge/homebridge) plugin exposes the
[Smart Recirculation Control 32](https://smartrecirculationcontrol.com/smart-recirculation-control/) devices to 
Apple's [HomeKit](https://www.apple.com/ios/home/).

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=for-the-badge&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

### Features
- On-demand triggering of the Smart Recirculation Control 32 system
- Instant notification of the controller's status
- Polling option to keep the controller in sync with Homebridge
- Support for multiple controllers

### Prerequisites
- [Homebridge](https://github.com/homebridge/homebridge)
- [Smart Recirculation Control 32 system by Leridian Dynamics](https://smartrecirculationcontrol.com/smart-recirculation-control-32/)
- Controller Firmware v6.1.1 or higher.


## Installation

Installing homebridge:

[Homebridge Installation](https://homebridge.io/how-to-install-homebridge)

Install homebridge-leridian-dynamics:
```sh
sudo npm i @agilisone/homebridge-leridian-dynamics
```

## Configuration

Add the `SmartRecircControl32` platform to `config.json`.

<i>This plugin does not discover devices on its own.</i>

Example configuration:

```js
{
    "name": "homebridge-leridian-dynamics",
    "devices": [
        {
            "name": "Hot Water Recirculation",
            "deviceUid": "123456789",
            "controllerName": "SmartCirc",
            "pollingInterval": 30,
            "serverConfig": {
                "port": 8123,
                "path": "/api/webhook/"
            }
        }
    ],
    "platform": "SmartRecircControl32",
    
}
```

### Properties

#### Platform Configuration Fields

- `platform` [required]
<u>Must</u> be set to **"SmartRecircControl32"**.

- `devices` [required]
This is a list of devices that will be controlled by HomeKit.

#### Device Fields

- `Name` [required]
This is the name of the accessory as it appears in HomeKit.
- `Unique ID` [required]
This is a unique ID that is part of a device's registration in Homebridge.
- `Controller Name` [required]
This should match the name of your controller that is specified in the <i>Smart Recirc 32</i> app.
- `Polling Interval` [required]
This specifies how many seconds the plugin waits before it requests the status of the controller. This is used to keep Homebridge in sync with the controller in the event a <i>push</i> request was missed.

- ### Server Configuration

    - `port` [required]
    This is the port that the controller will <i>push</i> to. This <u>must</u> match the port used in the `Webhook Outbound` parameter specified in the <i>Smart Recirc 32</i> app.
    - `path` [required]
    This is the local path that the controller will make a request to.  This <u>must</u> match the port used in the `Webhook Outbound` parameter specified in the <i>Smart Recirc 32</i> app.

## Issues

In the event you encounter any issues, please submit it [here](https://github.com/agilisone/homebridge-leridian-dynamics/issues).

I will try my absolute best to address them.