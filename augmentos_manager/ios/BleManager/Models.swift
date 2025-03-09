//
//  Models.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/3/25.
//

import Foundation

struct AiResponseToG1Model {
  var lines: [String]
  var totalPages: UInt8
  var newScreen: Bool
  var currentPage: UInt8 {
    didSet {
      print("SET : currentPage :\(currentPage)")
    }
  }
  var maxPages: UInt8
  var status: DisplayStatus
}

struct ThirdPartyCloudApp {
  let packageName: String
  let name: String
  let description: String
  let webhookURL: String
  let logoURL: String
  let isRunning: Bool
}
