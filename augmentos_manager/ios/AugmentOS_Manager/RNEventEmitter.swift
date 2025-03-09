//
//  RNEventEmitter.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/4/25.
//

import Foundation
import React

@objc(RNEventEmitter)
open class RNEventEmitter: RCTEventEmitter {

  public static var emitter: RCTEventEmitter!

  override init() {
    super.init()
    RNEventEmitter.emitter = self
  }

  open override func supportedEvents() -> [String] {
    // add more as needed
    ["onReady", "onPending", "onFailure", "onConnectionStateChanged", "CoreMessageIntentEvent"]
  }
}
