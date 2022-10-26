import express from 'express';
import HttpStatus from 'http-status-codes';

class ResponseHelper {
  init() {
    express.response.success = this.success;
    express.response.created = this.created;
    express.response.error = this.error;
    express.response.notFound = this.notFound;
    express.response.badRequest = this.badRequest;
    express.response.notAuthorized = this.notAuthorized;
    express.response.throwError = this.throwError;
  }

  created(data) {
    this.status(HttpStatus.CREATED).send({
      success: true,
      data,
    });
  }

  success(data) {
    this.status(HttpStatus.OK).send({
      success: true,
      data,
    });
  }

  error(error) {
    this.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      success: false,
      errors: {
        message: error.message ? error.message : error,
      },
    });
  }

  notFound(message) {
    this.status(HttpStatus.NOT_FOUND).send({
      success: false,
      error: message || 'Not found.',
    });
  }

  badRequest(errors) {
    this.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      error: { message: errors },
    });
  }

  throwError(err) {
    // joi validation
    let message = '';

    err.details.forEach((curr) => {
      message += curr.message.replace(/"/g, '');
    }, {});
    this.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
      success: false,
      error: { message },
    });
  }

  notAuthorized(error) {
    this.status(HttpStatus.UNAUTHORIZED).send({
      success: false,
      error,
    });
  }
}

export default ResponseHelper;
