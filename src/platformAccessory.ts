import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { SmartRecirc32Platform } from './platform.js';
import * as http from 'http';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory the platform registers. 
 */
export class SmartRecirc32PlatformAccessory {
  private service: Service;
  private controllerOnStatus = false;

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
      .onSet(this.setControllerOn.bind(this)); // SET - bind to the `setControllerOn` method below.

    // Create an HTTP server so that we can listen for requests from our accessory.
    const accessoryName = this.accessory.context.device.name;
    const serverConfig = this.accessory.context.device.serverConfig;
    const server = http.createServer(this.handleServerRequest.bind(this));
    const port = serverConfig.port;
    
    server.listen(port, () => {
      this.platform.log.info(`${accessoryName} : HTTP server listening on port ${port}`);
    });

    this.checkControllerStatus();

    // Set a timer to execute the checkStatus() function every minute.
    const pollingSeconds = this.accessory.context.device.pollingInterval as number;
    const pollingInterval = (pollingSeconds * 1000);
    this.platform.log.info(`${accessoryName} : Polling status every ${pollingSeconds} seconds`);
    setInterval(this.checkControllerStatus.bind(this), pollingInterval);
  }

  /**
   * Retrieves the controller's status so that we can stay in sync.
   */
  async checkControllerStatus() {    
    const accessoryName = this.accessory.context.device.name;
    const specificPath = '/status/';
    const url = this.returnCommandUrl() + specificPath;

    try {
      const fetchResp = await fetch(url);

      if (!fetchResp.ok) {
        this.platform.log.error(`${accessoryName} : Could not retrieve the controller's status. Failed response from ${url} ->`, fetchResp.status);
      }
      
      // Update the accessory's new status.
      const responseData = await fetchResp.text();
      this.platform.log.debug(`${accessoryName} : Controller responded with the following status: ->`, responseData);
      const controllerOnStatus = (Number(responseData.trim()) === 1);

      // Update Homekit with the new status.
      this.service.updateCharacteristic(this.platform.Characteristic.On, controllerOnStatus);
      this.platform.log.debug(`${accessoryName} : Controller's status: ->`, controllerOnStatus);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.platform.log.error(`${accessoryName} : Unknown error has occurred while attempting to retrieve the controller's status: ${error.message}`);
      }
    }   
  }

  /**
   * Handles requests to the HTTP server.
   * 
   * @param req 
   * @param resp
   * @returns 
   */
  handleServerRequest(req: http.IncomingMessage, resp: http.ServerResponse) {
    const accessoryName = this.accessory.context.device.name;
    const serverConfig = this.accessory.context.device.serverConfig;
    let controllerOnStatus = false;
    
    // Check if the URL matches the desired endpoint.
    let reqUrl = req.url;
    let path = (serverConfig.path as string).toLowerCase();
    path = this.prepPath(path);
    
    if (reqUrl !== undefined) {
      reqUrl = reqUrl.toLowerCase();

      if (reqUrl.indexOf(path) >= 0) {
        this.platform.log.debug(`${accessoryName} : HTTP server received external request. Request URL ->`, req.url);
        
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

          this.platform.log.error(`${accessoryName} : Invalid pump status "${pumpStatus}" received. Request URL ->`, req.url);

          return;
        }

        switch (pumpStatus) {
        case 'pump_on':
          controllerOnStatus = true;
          break;
        case 'pump_off':
          controllerOnStatus = false;
          break;
        }

        // Update Homekit with the new status.
        this.service.updateCharacteristic(this.platform.Characteristic.On, controllerOnStatus);
        
        resp.statusCode = 200;
        resp.end('OK');

        this.platform.log.info(`${accessoryName} : Set Characteristic On ->`, controllerOnStatus);
        this.platform.log.debug(`${accessoryName} : HTTP request successfully processed.`);
      } else {
        resp.statusCode = 204;
        resp.setHeader('Content-Length', 0);
        resp.end();

        if (reqUrl.indexOf('favicon') === -1) {
          this.platform.log.info(`${accessoryName} : External request received and ignored. Request URL ->`, req.url);
        }
      }
    }
  }

  /**
   * Returns the URL to use when issuing a command to the controller or retrieving its status.
   * 
   * @returns string
   */
  returnCommandUrl():string {
    const controllerName = (this.accessory.context.device.controllerName as string).toLowerCase();
    const specificName = 'ld-' + controllerName + '.local';
    const specificPort = '3030';
    
    return `http://${specificName}:${specificPort}`;
  }

  /**
   * Handle "SET" requests from HomeKit
   * 
   * Issuing the HTTP web request will cause the controller to turn on or off. This in turn will cause the controller to return
   * the controller's status to the Homebridge plugin.
   */
  async setControllerOn(value: CharacteristicValue) {
    // Sync the status by fetching it from the controller.
    const targetState = value as boolean;
    const accessoryName = this.accessory.context.device.name;
    const specificPath = '/pump/';
    const url = this.returnCommandUrl() + specificPath + (targetState ? '1' : '0');
   
    this.platform.log.info(`${accessoryName} : Received request from HomeKit to turn ${(targetState ? 'ON' : 'OFF')}`);
    this.platform.log.debug(`${accessoryName} : Sending HTTP request to ->'`, url);

    try {
      // Use fetch() to make http request that will toggle the controller's status.
      const fetchResp = await fetch(url);

      if (!fetchResp.ok) {
        this.platform.log.error(`${accessoryName} : Command sent to controller was not successful. URL: ${url}`, fetchResp.status);
      }
      
      // Update HomeKit (it will get corrected by webhook or polling if needed).
      this.service.updateCharacteristic(this.platform.Characteristic.On, targetState);
    } catch (error: unknown) {      
      if (error instanceof Error) {
        this.platform.log.error(`${accessoryName} : Unknown error has occurred while attempting to send command to the controller: ${error.message}`);
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
