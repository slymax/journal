angular.module('app')
  .filter('appDate', function ($filter) {
      return function (input) {
          return input ? $filter('date')(new Date(input), 'MM/dd/yyyy', 'UTC') : '';
      };
  })
  .filter('appDateTime', function ($filter) {
      return function (input) {
          return input ? $filter('date')(new Date(input), 'dd.MM.yyyy HH:mm') : '';
      };
  });
