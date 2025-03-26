import { Categories, type API, type Characteristic, type DynamicPlatformPlugin, type Logging, 
  type PlatformAccessory, type PlatformConfig, type Service } from 'homebridge';

import { SmartRecirc32PlatformAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

/**
 * HomebridgePlatform
 * Main class that implements the main constructor for the plugin.
 * Parses the user config and registers accessories with Homebridge.
 */
export class SmartRecirc32Platform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // Used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.log.debug('Finished initializing platform:', PLUGIN_NAME);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');

      // Validate plugin's configuration.
      log.info('Validating plugin\'s configuration...');
      const isValid = this.validateConfiguration();
      
      if (!isValid) {
        log.error('Cannot continue with device registration.');

        return;
      }

      // Register platform devices as accessories.
      this.registerDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);    

    // Add the restored accessory to the accessories cache, so we can track if it has already been registered    
    this.accessories.set(accessory.UUID, accessory);
  }

  /**
   * Register discovered accessories.
   * Note: Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  registerDevices() {
    // There is no discovery taking place. Instead use the user-defined array in the platform config.
    const platformDevices = this.config.devices;

    // Iterate over the discovered devices and register each one if it has not already been registered.
    for (const device of platformDevices) {
      // Generate a unique id for the accessory.
      const uuid = this.api.hap.uuid.generate(device.deviceUid);

      // Check to see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above.
      const existingAccessory = this.accessories.get(uuid);
      const minPollingSeconds = 5;
      const maxPollingSeconds = 300;

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        const requestedPolling = device.pollingInterval ?? 30; // Fallback default.
        const clampedPolling = Math.min(Math.max(requestedPolling, minPollingSeconds), maxPollingSeconds);
        const accessoryName = device.name;

        if (requestedPolling !== clampedPolling) {
          this.log.warn(
            `${accessoryName} : Polling interval of ${requestedPolling} is out of range. Allowed range is ${minPollingSeconds}-${maxPollingSeconds} seconds.`);
          
          this.log.warn(`${accessoryName} : Polling interval clamped to ${clampedPolling} seconds.`);
        }

        existingAccessory.context.device = {
          ...device,
          pollingInterval: clampedPolling,
        };

        // Update the platform accessory in case changes were made to the accessory's context.
        this.api.updatePlatformAccessories([existingAccessory]);

        // Create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`.
        new SmartRecirc32PlatformAccessory(this, existingAccessory);
      } else {
        // Accessory does not yet exist, so we need to create it.
        this.log.info('Adding new \'SmartRecirc32Accessory\' accessory:', device.name);

        // Create a new accessory
        const category = Categories.OUTLET;
        const accessory = new this.api.platformAccessory(device.name, uuid, category);

        // Store a copy of the device object in the `accessory.context`.
        // The `context` property can be used to store any data about the accessory you may need.

        const requestedPolling = device.pollingInterval ?? 30; // Fallback default.
        const clampedPolling = Math.min(Math.max(requestedPolling, minPollingSeconds), maxPollingSeconds);
        const accessoryName = device.name;

        if (requestedPolling !== clampedPolling) {
          this.log.warn(
            `${accessoryName} : Polling interval of ${requestedPolling} is out of range. Allowed range is ${minPollingSeconds}-${maxPollingSeconds} seconds.`);
          
          this.log.warn(`${accessoryName} : Polling interval clamped to ${clampedPolling} seconds.`);
        }

        accessory.context.device = {
          ...device,
          pollingInterval: clampedPolling,
        };

        // Create the accessory handler for the newly created accessory
        // Imported from `platformAccessory.ts`.
        new SmartRecirc32PlatformAccessory(this, accessory);

        // Link the accessory to your platform.
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      // Push into discoveredCacheUUIDs
      this.discoveredCacheUUIDs.push(uuid);
    }
  }

  /**
   * Validates that the plugin's configuration.
   * 
   * @returns boolean
   */
  validateConfiguration():boolean {
    const devicesToValidate = this.config.devices;
    const nameMap: { [key: string]: boolean } = {};
    const uidMap: { [key: string]: boolean } = {};
    const controllerNameMap: { [key: string]: boolean } = {};
    const portMap: { [key: number]: boolean } = {};
    const errors: string[] = [];

    // Verify that there is at least one device to configure.
    if (!devicesToValidate || !Array.isArray(devicesToValidate) || !devicesToValidate.length) {
      this.log.error('No devices found in configuration. Please verify that at least one device has been added to the plugin\'s configuration.');

      return false;
    }

    // Iterate through each device that has been added to the configuration.
    for (const device of devicesToValidate) {
      // Validate Name.
      if (device.name in nameMap) {
        errors.push(`Duplicate "Name" detected: "${device.name}". Each device name must be unique.`);
      } else {
        nameMap[device.name] = true;
      }

      // Validate Unique UID.
      if (device.deviceUid in uidMap) {
        errors.push(`Duplicate "Unique ID" detected: "${device.deviceUid}". The ID for each device must be unique.`);
      } else {
        uidMap[device.deviceUid] = true;
      }

      // Validate Controller Name.
      if (device.controllerName in controllerNameMap) {
        errors.push(`Duplicate "Controller Name" detected: "${device.controllerName}". The controller name for each device must be unique.`);
      } else {
        controllerNameMap[device.controllerName] = true;
      }

      // Validate for Port.
      if (device.serverConfig.port in portMap) {
        errors.push(`Duplicate "Port" detected: ${device.serverConfig.port}. The port for each device's server configuration must be unique.`);
      } else {
        portMap[device.serverConfig.port] = true;
      }
    }

    // Throw one big error if anything failed.
    if (errors.length > 0) {
      const errorMsg = 'Configuration validation failed:\n' + errors.map(e => ` - ${e}`).join('\n');
      this.log.error(errorMsg);

      return false;
    } else {
      return true;
    }
  }
}
