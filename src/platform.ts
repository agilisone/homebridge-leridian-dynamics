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

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

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
        accessory.context.device = device;

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
}
