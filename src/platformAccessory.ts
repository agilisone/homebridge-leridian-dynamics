import type { PlatformAccessory, Service } from 'homebridge';
import type { SmartRecirc32Platform } from './platform.js';
import * as http from 'http';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory the platform registers. 
 */
export class SmartRecirc32PlatformAccessory {
  private service: Service;
  private pumpOnStatus = false;

  constructor(
    private readonly platform: SmartRecirc32Platform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Set accessory information.
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Leridian Dynamics')
      .setCharacteristic(this.platform.Characteristic.Model, 'Smart Recirculation Control 32');

    // Get the Outlet service if it exists, otherwise create a new Outlet service.
    this.service = this.accessory.getService(this.platform.Service.Outlet) || this.accessory.addService(this.platform.Service.Outlet);
    
    // Set the service name, this is what is displayed as the default name on the Home app.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // Implement the "required characteristics" for the given service type.
    // See https://developers.homebridge.io/#/service/Outlet

    // Register handlers for the On/Off Characteristic.
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this)); // SET - bind to the `setOn` method below

    // Create an Http server so that we can listen for requests from our accessory.
    const accessoryName = this.accessory.context.device.name;
    const serverConfig = this.accessory.context.device.serverConfig;
    const server = http.createServer((req: http.IncomingMessage, resp: http.ServerResponse) => {
      // Check if the URL matches your desired endpoint
      let reqUrl = req.url;
      let path = (serverConfig.path as string).toLowerCase();
      path = this.prepPath(path);
      
      if (reqUrl !== undefined) {
        reqUrl = reqUrl.toLowerCase();

        if (reqUrl.indexOf(path) >= 0) {
          this.platform.log.debug(accessoryName + ': Received external HTTP request. Request URL ->', req.url);
          
          // Determine the status of the accessory.
          const pumpStatus = reqUrl.split(path)[1];
          
          // Check if the pump status received is valid.
          switch (pumpStatus) {
          case 'pump_on':            
          case 'pump_off':
            break;
          default:
            resp.statusCode = 204;
            resp.setHeader('Content-Length', 0);
            resp.end();

            this.platform.log.error(accessoryName + ': Invalid pump status \'' + pumpStatus + '\' received. Request URL ->', req.url);

            return;
          }

          // Prevent the accessory's 'ON' characteristic from being set twice.
          // This occurs when user triggers the accessory manually and the accessory then sends an HTTP request notifying the HTTP server
          // of its status.
          if ((pumpStatus === 'pump_on' && this.pumpOnStatus) || (pumpStatus === 'pump_off' && !this.pumpOnStatus)) {
            this.platform.log.debug(accessoryName + ': Ignoring HTTP request. Status is already set to "' + pumpStatus + '."');

            resp.statusCode = 200;
            resp.end('OK');

            return;
          }

          switch (pumpStatus) {
          case 'pump_on':
            this.pumpOnStatus = true;
            
            break;
          case 'pump_off':
            this.pumpOnStatus = false;
            
            break;
          }

          // Update Homekit with the new status.
          this.service.updateCharacteristic(this.platform.Characteristic.On, this.pumpOnStatus);
          
          resp.statusCode = 200;
          resp.end('OK');

          this.platform.log.info(accessoryName + ': Set Characteristic On ->', this.pumpOnStatus);
          this.platform.log.debug(accessoryName + ': HTTP request successfully processed.');
        } else {
          resp.statusCode = 204;
          resp.setHeader('Content-Length', 0);
          resp.end();

          if (reqUrl.indexOf('favicon') === -1) {
            this.platform.log.info(accessoryName + ': External request received and ignored. Request URL ->', req.url);            
          }
        }
      }
    });
    
    const port = serverConfig.port;
    server.listen(port, () => {
      this.platform.log.info(accessoryName + ': HTTP server for accessory listening on port ' + port);
    });
  }

  /**
   * Handle "SET" requests from HomeKit
   */
  async setOn() {
    const pumpOn = !this.pumpOnStatus;
    const currentValue = new Number(pumpOn);    
    const accessoryName = this.accessory.context.device.name;
    const controllerName = (this.accessory.context.device.controllerName as string).toLowerCase();
    const specificName = 'ld-' + controllerName + '.local';
    const specificPort = '3030';
    const specificPath = '/pump/';    
    const url = 'http://' + specificName  + ':' + specificPort + specificPath + currentValue.toString();
    
    this.platform.log.debug(accessoryName + ': Sending HTTP request to -> ' + url);

    try {
      // Use fetch() to make http request that will toggle the controller.
      const fetchResp = await fetch(url);

      if (!fetchResp.ok) {
        this.platform.log.error(accessoryName + ': Unable to send HTTP request to -> ' + url, fetchResp.status);
      }
      
      // Update Homekit with the new status.
      this.pumpOnStatus = pumpOn;
      this.platform.log.info(accessoryName + ': Set Characteristic On ->', this.pumpOnStatus);
    } catch (error: unknown) {      
      if (error instanceof Error) {
        this.platform.log.error(accessoryName + ': Unable to send HTTP request: ' + error.message);
      }      
    }
  }

  /**
   * Prepares the specified string by both prepending and appending back slashes.
   * 
   * @param path 
   * 
   * @returns string
   */
  prepPath(path: string) {
    // Append proper forward slashes if needed.
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    if (!path.endsWith('/')) {
      path = path + '/';
    }

    return path;
  }
}
